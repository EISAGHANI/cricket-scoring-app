/** DELIVERY: runs, boundaries, extras, strike rotation, free hits, on-ball dismissals (§5–§9). */
import { violation } from "../errors";
import { must } from "../internal/must";
import { allowedDismissalKinds, DISMISSAL_RULES } from "../rules/dismissals";
import type { DeliveryDismissal, DeliveryEvent, DeliveryPayload } from "../types/events";
import type { InningsState, MatchState } from "../types/state";
import type { MatchRules } from "../types/rules";
import {
	bowlerLine,
	currentBowlerId,
	needsBatter,
	needsBowler,
	overDue,
	requireInnings,
	requireNotInterrupted,
	requireRules,
} from "./context";
import { checkInningsEnd } from "./innings";
import { maybeGoSolo, openPartnership, recordDismissal, validateFielders } from "./wickets";

const MAX_RUNS = 20;

function isCount(n: unknown, max: number): n is number {
	return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;
}

export interface DeliveryScore {
	/** Runs from running/boundary (before extras penalties). */
	scored: number;
	batterRuns: number;
	bowlerRuns: number;
	teamRuns: number;
	legal: boolean;
	faced: boolean;
	/** Runs that decide strike rotation (R-STR-01..04). */
	rotationRuns: number;
	extras: { wides: number; noBalls: number; byes: number; legByes: number; penalties: number };
	/** A four/six credited to the batter (not an overthrow, not extras). */
	batterBoundary: "FOUR" | "SIX" | null;
}

/** Pure scoring of one delivery (R-RUN-01..03, R-EXT-01..10). */
export function scoreDelivery(rules: MatchRules, p: DeliveryPayload): DeliveryScore {
	const allowance =
		p.boundary === "FOUR" ? rules.boundaryFour : p.boundary === "SIX" ? rules.boundarySix : 0;
	let scored: number;
	let rotationRuns: number;
	if (p.boundary === null) {
		scored = p.runs;
		rotationRuns = p.runs;
	} else if (p.overthrow) {
		scored = p.runs + allowance; // R-RUN-03
		rotationRuns = p.runs;
	} else {
		scored = Math.max(p.runs, allowance); // R-RUN-02
		rotationRuns = p.runs > allowance ? p.runs : 0;
	}
	const extras = { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: p.penaltyRuns };
	let batterRuns = 0;
	let bowlerRuns = 0;
	const kind = p.extra?.kind ?? null;
	if (p.extra === null) {
		batterRuns = scored;
		bowlerRuns = scored;
	} else if (p.extra.kind === "WIDE") {
		extras.wides = rules.wideRuns + scored;
		bowlerRuns = extras.wides;
	} else if (p.extra.kind === "NO_BALL") {
		extras.noBalls = rules.noBallRuns;
		bowlerRuns = rules.noBallRuns;
		if (p.extra.runsFrom === "BAT") {
			batterRuns = scored;
			bowlerRuns += scored;
		} else if (rules.noBallByesScoredAs === "NO_BALLS") {
			extras.noBalls += scored; // R-EXT-08, literal Law 21.10 reading
			bowlerRuns += scored;
		} else if (p.extra.runsFrom === "BYE") {
			extras.byes = scored;
		} else {
			extras.legByes = scored;
		}
	} else if (p.extra.kind === "BYE") {
		extras.byes = scored;
	} else {
		extras.legByes = scored;
	}
	const teamRuns =
		batterRuns + extras.wides + extras.noBalls + extras.byes + extras.legByes + extras.penalties;
	const creditedToBat =
		p.extra === null || (p.extra.kind === "NO_BALL" && p.extra.runsFrom === "BAT");
	return {
		scored,
		batterRuns,
		bowlerRuns,
		teamRuns,
		legal: kind === null || kind === "BYE" || kind === "LEG_BYE",
		faced: kind !== "WIDE",
		rotationRuns,
		extras,
		batterBoundary: creditedToBat && !p.overthrow ? p.boundary : null,
	};
}

function ballLabel(p: DeliveryPayload, s: DeliveryScore): string {
	const w = p.dismissal === null ? "" : "W";
	const pen = p.penaltyRuns > 0 ? `+${p.penaltyRuns}p` : "";
	let base: string;
	if (p.extra === null) base = s.scored === 0 ? (w === "" ? "•" : "") : String(s.scored);
	else if (p.extra.kind === "WIDE") base = `${s.extras.wides}wd`;
	else if (p.extra.kind === "NO_BALL")
		base = `${s.extras.noBalls + s.batterRuns + s.extras.byes + s.extras.legByes}nb`;
	else if (p.extra.kind === "BYE") base = `${s.extras.byes}b`;
	else base = `${s.extras.legByes}lb`;
	return `${base}${w}${pen}`;
}

function validate(state: MatchState, inn: InningsState, p: DeliveryPayload): void {
	const rules = requireRules(state);
	if (needsBatter(inn)) violation("BATTER_NEEDED", "R-DIS-09", "A new batter must come in first");
	if (needsBowler(inn))
		violation("BOWLER_NEEDED", "R-OV-05", "Choose the bowler for the next over");
	if (overDue(inn) && !p.overMiscount)
		violation("OVER_COMPLETE", "R-OV-01", "The over is complete");
	if (!overDue(inn) && p.overMiscount) {
		violation(
			"NOT_A_MISCOUNT",
			"R-OV-01",
			"An extra-ball miscount is only possible once the over is due",
		);
	}
	if (!isCount(p.runs, MAX_RUNS))
		violation("INVALID_RUNS", "R-RUN-01", "Runs must be a whole number 0–20");
	if (!isCount(p.penaltyRuns, MAX_RUNS))
		violation("INVALID_RUNS", "R-EXT-10", "Invalid penalty runs");
	if (p.boundary === "SIX" && (p.runs !== 0 || p.overthrow)) {
		violation(
			"INVALID_BOUNDARY",
			"R-RUN-02",
			"A six cannot include runs completed or an overthrow",
		);
	}
	const kind = p.extra?.kind ?? null;
	const viaBye =
		kind === "BYE" ||
		kind === "LEG_BYE" ||
		kind === "WIDE" ||
		(p.extra?.kind === "NO_BALL" && p.extra.runsFrom !== "BAT");
	if (p.boundary === "SIX" && viaBye)
		violation("INVALID_BOUNDARY", "R-EXT-05", "Extras cannot be a six");
	if ((kind === "BYE" || kind === "LEG_BYE") && p.runs === 0 && p.boundary === null) {
		violation("INVALID_RUNS", "R-EXT-05", "Byes and leg byes need at least one run");
	}
	if (p.dismissal !== null) validateDismissal(state, inn, p, p.dismissal, rules);
}

function validateDismissal(
	state: MatchState,
	inn: InningsState,
	p: DeliveryPayload,
	d: DeliveryDismissal,
	rules: MatchRules,
): void {
	const kind = p.extra?.kind ?? null;
	const allowed = allowedDismissalKinds(kind, inn.freeHit, rules.allowHandledTheBall);
	if (!allowed.includes(d.kind)) {
		violation(
			"DISMISSAL_NOT_ALLOWED",
			"R-DIS-01",
			`${d.kind} is not possible on this delivery${inn.freeHit ? " (free hit)" : ""}`,
		);
	}
	const rule = DISMISSAL_RULES[d.kind];
	if (rule.strikerOnly && d.batterId !== inn.strikerId) {
		violation("WRONG_BATTER", "R-DIS-01", `Only the striker can be out ${d.kind}`);
	}
	if (d.batterId !== inn.strikerId && d.batterId !== inn.nonStrikerId) {
		violation("BATTER_NOT_AT_CREASE", "R-DIS-05", `${d.batterId} is not batting`);
	}
	if (!rule.allowsRuns && (p.runs !== 0 || p.boundary !== null)) {
		violation("DEAD_BALL_RUNS", "R-DIS-01", `No runs can be scored when out ${d.kind}`);
	}
	if (rule.allowsRuns && p.boundary !== null) {
		violation(
			"DEAD_BALL_RUNS",
			"R-DIS-05",
			"A boundary and a run out cannot happen on the same ball",
		);
	}
	validateFielders(state, inn, d.fielderIds, "R-DIS-03");
	if (d.kind === "CAUGHT" && d.fielderIds.length !== 1) {
		violation("CATCHER_REQUIRED", "R-DIS-03", "A catch needs exactly one fielder");
	}
	if (d.kind === "STUMPED") {
		const keeper = state.keepers[inn.bowlingTeamId];
		if (d.fielderIds.length > 1 || (d.fielderIds.length === 1 && d.fielderIds[0] !== keeper)) {
			violation("NOT_THE_KEEPER", "R-DIS-04", "Only the wicket-keeper can make a stumping");
		}
	}
}

export function applyDelivery(state: MatchState, event: DeliveryEvent): void {
	const inn = requireInnings(state);
	requireNotInterrupted(state);
	const rules = requireRules(state);
	const p = event.payload;
	validate(state, inn, p);

	const s = scoreDelivery(rules, p);
	const over = must(inn.currentOver, "current over");
	const bowlerId = must(currentBowlerId(inn), "bowler");
	const strikerId = must(inn.strikerId, "striker");
	const bowler = bowlerLine(inn, bowlerId);
	const striker = must(
		inn.batters.find((b) => b.playerId === strikerId),
		"striker line",
	);

	// Batter (R-RUN-01, R-EXT-03..05).
	if (s.faced) striker.balls++;
	striker.runs += s.batterRuns;
	if (s.legal && s.batterRuns === 0) striker.dots++;
	if (s.batterBoundary === "FOUR") striker.fours++;
	if (s.batterBoundary === "SIX") striker.sixes++;

	// Bowler.
	if (s.legal) bowler.legalBalls++;
	bowler.runs += s.bowlerRuns;
	if (p.extra?.kind === "WIDE") bowler.wides++;
	if (p.extra?.kind === "NO_BALL") bowler.noBalls++;
	if (s.legal && s.bowlerRuns === 0) bowler.dots++;
	if (s.batterBoundary === "FOUR") bowler.foursConceded++;
	if (s.batterBoundary === "SIX") bowler.sixesConceded++;

	// Team.
	inn.runs += s.teamRuns;
	inn.extras.wides += s.extras.wides;
	inn.extras.noBalls += s.extras.noBalls;
	inn.extras.byes += s.extras.byes;
	inn.extras.legByes += s.extras.legByes;
	inn.extras.penalties += s.extras.penalties;
	if (p.boundary !== null) inn.boundaries++;
	if (s.legal) inn.legalBalls++;

	// Over.
	if (s.legal) over.legalBalls++;
	over.runs += s.teamRuns;
	over.bowlerRuns += s.bowlerRuns;
	if (p.overMiscount) over.miscount = true;
	over.balls.push({
		seq: event.seq,
		label: ballLabel(p, s),
		runs: s.teamRuns,
		legal: s.legal,
		wicket: p.dismissal !== null,
		bowlerId,
		batterId: strikerId,
	});

	// Partnership.
	const partnership = must(openPartnership(inn), "partnership");
	partnership.runs += s.teamRuns;
	if (s.legal) partnership.legalBalls++;
	const contribution = must(partnership.contributions[strikerId], "contribution");
	contribution.runs += s.batterRuns;
	if (s.faced) contribution.balls++;

	// Free hit (R-EXT-03): every no-ball; a wide or no-ball on a free hit keeps it.
	const wasFreeHit = inn.freeHit;
	const kind = p.extra?.kind ?? null;
	inn.freeHit =
		rules.freeHit === "ALL_NO_BALLS" && (kind === "NO_BALL" || (wasFreeHit && kind === "WIDE"));

	// Strike (R-STR-01..04).
	if (s.rotationRuns % 2 === 1 && !inn.soloBatting) {
		[inn.strikerId, inn.nonStrikerId] = [inn.nonStrikerId, inn.strikerId];
	}

	if (p.dismissal !== null) applyDeliveryDismissal(state, inn, p.dismissal);
	checkInningsEnd(state, inn);
}

function applyDeliveryDismissal(state: MatchState, inn: InningsState, d: DeliveryDismissal): void {
	const fielderIds =
		d.kind === "STUMPED" ? [must(state.keepers[inn.bowlingTeamId], "keeper")] : d.fielderIds;
	recordDismissal(inn, d.batterId, d.kind, fielderIds);
	if (DISMISSAL_RULES[d.kind].strikerOnly) {
		// R-DIS-06/07: the striker's end is vacant; the new batter takes strike.
		inn.strikerId = null;
	} else {
		// R-DIS-05: the not-out batter stays at the other end; the new batter goes to `end`.
		const survivor = inn.strikerId === d.batterId ? inn.nonStrikerId : inn.strikerId;
		const outAt = d.end ?? (inn.strikerId === d.batterId ? "STRIKER" : "NON_STRIKER");
		if (inn.soloBatting) {
			inn.strikerId = null;
		} else if (outAt === "STRIKER") {
			inn.strikerId = null;
			inn.nonStrikerId = survivor;
		} else {
			inn.nonStrikerId = null;
			inn.strikerId = survivor;
		}
	}
	maybeGoSolo(state, inn);
}
