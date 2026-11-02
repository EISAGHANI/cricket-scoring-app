/**
 * Rain-rule target revision (CRICKET_RULES.md §13). Pure functions over plain inputs, so they can
 * be used by the reducer, the scorer UI ("what if" calculators) and tests alike.
 */
import { violation } from "../errors";
import { must } from "../internal/must";
import type { OversReduction } from "../types/state";

/**
 * Percentage of resources remaining with `overs` overs left and `wickets` wickets lost.
 * Rows are indexed by whole overs remaining (0..N), columns by wickets lost (0..9).
 * ADR-0013: the engine never embeds an official table; deployments supply one.
 */
export interface ResourceTable {
	/** Where the numbers come from; shown on scorecards that use the table. */
	source: string;
	/** rows[oversRemaining][wicketsLost], percentages. rows[0] must be all zeros. */
	rows: number[][];
}

export function validateResourceTable(table: ResourceTable): void {
	const bad = (why: string): never => violation("INVALID_RESOURCE_TABLE", "R-TR-05", why);
	if (table.rows.length < 2) bad("needs at least two rows");
	for (const [overs, row] of table.rows.entries()) {
		if (row.length !== 10) bad(`row ${overs} must have 10 columns`);
		for (const [w, value] of row.entries()) {
			if (!Number.isFinite(value) || value < 0 || value > 100)
				bad(`row ${overs} col ${w} out of range`);
			if (overs === 0 && value !== 0) bad("row 0 must be zero");
			if (w > 0 && value > must(row[w - 1], "cell"))
				bad(`row ${overs} must not increase with wickets`);
		}
		const previous = table.rows[overs - 1];
		if (previous !== undefined && row.some((v, w) => v < must(previous[w], "cell")))
			bad(`row ${overs} must not decrease with overs`);
	}
}

/** Resources (%) with fractional overs remaining, interpolating linearly between whole overs. */
export function resources(
	table: ResourceTable,
	oversRemaining: number,
	wicketsLost: number,
): number {
	if (wicketsLost >= 10 || oversRemaining <= 0) return 0;
	const maxOvers = table.rows.length - 1;
	const o = Math.min(oversRemaining, maxOvers);
	const lo = Math.floor(o);
	const hi = Math.min(lo + 1, maxOvers);
	const w = Math.max(0, wicketsLost);
	const a = must(must(table.rows[lo], "row")[w], "cell");
	const b = must(must(table.rows[hi], "row")[w], "cell");
	return a + (b - a) * (o - lo);
}

export interface InningsResourceInput {
	/** Overs available when the innings started. */
	initialOvers: number;
	ballsPerOver: number;
	/** Overs reductions during the innings, in order. */
	reductions: OversReduction[];
}

/** R1 / R2: resources available to a side, net of interruptions (R-TR-05). */
export function inningsResources(table: ResourceTable, input: InningsResourceInput): number {
	let r = resources(table, input.initialOvers, 0);
	for (const red of input.reductions) {
		const bowled = red.legalBalls / input.ballsPerOver;
		const before = resources(table, red.oversBefore - bowled, red.wickets);
		const after = resources(table, red.oversAfter - bowled, red.wickets);
		r -= before - after;
	}
	return r;
}

/** DLS Standard-style target (R-TR-05). */
export function dlsTarget(team1Runs: number, r1: number, r2: number, g50: number): number {
	if (r2 < r1) return Math.floor((team1Runs * r2) / r1) + 1;
	return Math.floor(team1Runs + (g50 * (r2 - r1)) / 100) + 1;
}

/** DLS Standard-style par score after the chasing side has used `r2Used` resources. */
export function dlsPar(team1Runs: number, r1: number, r2Used: number, g50: number): number {
	return dlsTarget(team1Runs, r1, r2Used, g50) - 1;
}

/**
 * Average run rate (R-TR-03). Team 1's rate uses its full allocation when all out, mirroring NRR.
 */
export function arrTarget(team1Runs: number, team1Overs: number, team2Overs: number): number {
	return Math.floor((team1Runs * team2Overs) / team1Overs) + 1;
}

/** Most productive overs (R-TR-04): sum of team 1's best `team2Overs` overs, plus one. */
export function mpoTarget(team1OverRuns: number[], team2Overs: number): number {
	const best = [...team1OverRuns].sort((a, b) => b - a).slice(0, team2Overs);
	return best.reduce((n, r) => n + r, 0) + 1;
}
