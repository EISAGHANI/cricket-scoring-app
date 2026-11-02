/** Derived metrics (CRICKET_RULES.md §15). All return null when the denominator is zero. */
import { ballsUsed } from "../reducer/context";
import type { BatterLine, BowlerLine, InningsState, MatchState } from "../types/state";
import type { TeamId } from "../types/ids";

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

export const strikeRate = (runs: number, balls: number): number | null => {
	const r = ratio(runs, balls);
	return r === null ? null : r * 100;
};
export const economy = (runs: number, legalBalls: number, ballsPerOver: number): number | null =>
	ratio(runs, legalBalls / ballsPerOver);
export const average = (runs: number, dismissals: number): number | null => ratio(runs, dismissals);
export const runRate = (inn: InningsState): number | null =>
	ratio(inn.runs, inn.legalBalls / inn.ballsPerOver);

export function requiredRunRate(inn: InningsState): number | null {
	if (inn.target === null || inn.maxOvers === null) return null;
	const ballsLeft = inn.maxOvers * inn.ballsPerOver - ballsUsed(inn);
	return ratio(Math.max(0, inn.target - inn.runs), ballsLeft / inn.ballsPerOver);
}

export interface ProjectedScore {
	label: string;
	rate: number;
	score: number;
}

/** Projected total at the current rate and at alternative rates (R-RUN projections, §15). */
export function projectedScores(
	inn: InningsState,
	alternativeRates = [6, 8, 10],
): ProjectedScore[] {
	const current = runRate(inn);
	if (inn.maxOvers === null || current === null) return [];
	const oversLeft = (inn.maxOvers * inn.ballsPerOver - ballsUsed(inn)) / inn.ballsPerOver;
	const at = (label: string, rate: number): ProjectedScore => ({
		label,
		rate,
		score: Math.round(inn.runs + rate * oversLeft),
	});
	const rates = [current - 2, current - 1, current + 1, current + 2].filter((r) => r > 0);
	return [
		at("Current", current),
		...rates.map((r) =>
			at(r > current ? `+${Math.round(r - current)}` : `${Math.round(r - current)}`, r),
		),
		...alternativeRates.map((r) => at(`${r} RPO`, r)),
	];
}

export const batterDotPercent = (b: BatterLine): number | null => {
	const r = ratio(b.dots, b.balls);
	return r === null ? null : r * 100;
};
export const batterBoundaryPercent = (b: BatterLine): number | null => {
	const r = ratio(b.fours * 4 + b.sixes * 6, b.runs);
	return r === null ? null : r * 100;
};
export const ballsPerBoundary = (b: BatterLine): number | null => ratio(b.balls, b.fours + b.sixes);
export const bowlerDotPercent = (b: BowlerLine): number | null => {
	const r = ratio(b.dots, b.legalBalls);
	return r === null ? null : r * 100;
};

export interface NrrInput {
	runsFor: number;
	/** Overs faced, as a fraction of overs (balls / ballsPerOver). */
	oversFor: number;
	runsAgainst: number;
	oversAgainst: number;
}

/**
 * One team's NRR input from a completed limited-overs match (§15): a side bowled out counts as
 * having faced its full (possibly revised) allocation. null for no-result/abandoned matches and
 * for multi-day matches.
 */
export function nrrInput(state: MatchState, teamId: TeamId): NrrInput | null {
	const result = state.result;
	if (result === null || result.kind === "NO_RESULT" || result.kind === "ABANDONED") return null;
	if (state.rules?.inningsPerSide !== 1) return null;
	const regular = state.innings.filter((i) => i.kind === "REGULAR");
	const own = regular.find((i) => i.battingTeamId === teamId);
	const opp = regular.find((i) => i.battingTeamId !== teamId);
	if (own === undefined || opp === undefined) return null;
	const overs = (inn: InningsState): number =>
		inn.closeReason === "ALL_OUT" && inn.maxOvers !== null
			? inn.maxOvers
			: ballsUsed(inn) / inn.ballsPerOver;
	return {
		runsFor: own.runs,
		oversFor: overs(own),
		runsAgainst: opp.runs,
		oversAgainst: overs(opp),
	};
}

/** Net run rate over a set of matches: (Σ runs for / Σ overs faced) − (Σ against / Σ bowled). */
export function netRunRate(inputs: readonly NrrInput[]): number | null {
	const sum = (f: (i: NrrInput) => number): number => inputs.reduce((n, i) => n + f(i), 0);
	const forRate = ratio(
		sum((i) => i.runsFor),
		sum((i) => i.oversFor),
	);
	const againstRate = ratio(
		sum((i) => i.runsAgainst),
		sum((i) => i.oversAgainst),
	);
	if (forRate === null || againstRate === null) return null;
	return forRate - againstRate;
}
