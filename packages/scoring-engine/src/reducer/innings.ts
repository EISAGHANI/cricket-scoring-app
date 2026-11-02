/** Innings lifecycle: end conditions, closing, targets, ordering, and the computed result. */
import { must } from "../internal/must";
import type { TeamId } from "../types/ids";
import type { MatchResult } from "../types/results";
import type { InningsCloseReason, InningsState, MatchState } from "../types/state";
import { ballsUsed, otherTeam, requireRules, unstartOver } from "./context";

export function regularInnings(state: MatchState): InningsState[] {
	return state.innings.filter((i) => i.kind === "REGULAR");
}

export function aggregate(state: MatchState, teamId: TeamId): number {
	return regularInnings(state)
		.filter((i) => i.battingTeamId === teamId)
		.reduce((n, i) => n + i.runs, 0);
}

/** Follow-on margin from match length (R-MD-04, Law 14.1.1). */
export function followOnMargin(maxDays: number | null, configured: number | null): number {
	if (configured !== null) return configured;
	if (maxDays === null || maxDays >= 5) return 200;
	if (maxDays >= 3) return 150;
	if (maxDays === 2) return 100;
	return 75;
}

/** Records a completed over: maiden credit (R-OV-04) and history. */
export function completeOver(inn: InningsState): void {
	const over = must(inn.currentOver, "current over");
	const bowlerId = over.bowlerIds[0];
	if (
		over.bowlerIds.length === 1 &&
		bowlerId !== undefined &&
		over.legalBalls >= inn.ballsPerOver &&
		over.bowlerRuns === 0
	) {
		must(
			inn.bowlers.find((b) => b.playerId === bowlerId),
			"bowler line",
		).maidens++;
	}
	inn.overs.push(over);
	// A partial final over (innings ended mid-over) is history, not a completed over.
	if (over.legalBalls >= inn.ballsPerOver || over.miscount) inn.completedOvers++;
	inn.currentOver = null;
}

export function closeInnings(
	state: MatchState,
	inn: InningsState,
	reason: InningsCloseReason,
): void {
	if (inn.currentOver !== null) {
		if (inn.currentOver.balls.length > 0) completeOver(inn);
		else unstartOver(inn); // a bowler was named but never bowled
	}
	for (const b of inn.batters) if (b.status === "BATTING") b.status = "NOT_OUT";
	const open = inn.partnerships[inn.partnerships.length - 1];
	if (open !== undefined && open.endedBy === null) {
		open.endedBy = "INNINGS_END";
		open.runs += inn.pendingPartnershipRuns;
		inn.pendingPartnershipRuns = 0;
	}
	inn.status = "COMPLETE";
	inn.closeReason = reason;
	inn.freeHit = false;
	afterInningsClosed(state);
}

/** R-INN-02: close the innings automatically when an end condition is met. */
export function checkInningsEnd(state: MatchState, inn: InningsState): void {
	if (inn.status !== "IN_PROGRESS") return;
	if (inn.target !== null && inn.runs >= inn.target) return closeInnings(state, inn, "TARGET");
	if (inn.wickets >= inn.maxWickets) return closeInnings(state, inn, "ALL_OUT");
	if (inn.maxOvers !== null) {
		const ballsInOver = inn.currentOver?.legalBalls ?? 0;
		const finished =
			inn.completedOvers >= inn.maxOvers ||
			(inn.completedOvers === inn.maxOvers - 1 && ballsInOver >= inn.ballsPerOver);
		if (finished) return closeInnings(state, inn, "OVERS");
	}
}

/** After any innings closes: follow-on availability and the provisional result. */
export function afterInningsClosed(state: MatchState): void {
	const rules = requireRules(state);
	const regular = regularInnings(state);
	if (rules.inningsPerSide === 2 && regular.length === 2 && rules.followOnEnabled) {
		const [first, second] = regular as [InningsState, InningsState];
		const lead = first.runs - second.runs;
		const margin = followOnMargin(rules.maxDays, rules.followOnMargin);
		state.followOn = { available: lead >= margin, enforced: null };
	}
	state.provisionalResult = computeResult(state);
}

/** Recompute targets that depend on earlier innings (e.g. after penalty runs, R-EXT-09). */
export function refreshTargets(state: MatchState): void {
	for (const inn of state.innings) {
		if (inn.targetRevised || inn.target === null) continue;
		inn.target = baseTarget(state, inn);
	}
}

/** Target for an innings, ignoring revisions (R-INN-07). null when the innings is not a chase. */
export function baseTarget(state: MatchState, inn: InningsState): number | null {
	const rules = requireRules(state);
	if (inn.kind === "SUPER_OVER") {
		const first = state.innings.find(
			(i) => i.superOverRound === inn.superOverRound && i.index < inn.index,
		);
		return first === undefined ? null : first.runs + 1;
	}
	const regular = regularInnings(state);
	const position = regular.findIndex((i) => i.index === inn.index);
	const last = rules.inningsPerSide * 2 - 1;
	if (position !== last) return null;
	const own = regular.slice(0, position).filter((i) => i.battingTeamId === inn.battingTeamId);
	const opponent = regular.slice(0, position).filter((i) => i.battingTeamId !== inn.battingTeamId);
	const sum = (list: InningsState[]): number => list.reduce((n, i) => n + i.runs, 0);
	return sum(opponent) - sum(own) + 1;
}

export interface NextInnings {
	battingTeamId: TeamId;
	kind: "REGULAR" | "SUPER_OVER";
	superOverRound: number | null;
	followOn: boolean;
}

/** Who bats next, or null if no further innings is due (R-MD-01, R-SO-01). */
export function nextInnings(state: MatchState): NextInnings | null {
	const rules = requireRules(state);
	if (state.toss === null || state.result !== null || state.provisionalResult !== null) return null;
	if (state.innings.some((i) => i.status === "IN_PROGRESS")) return null;
	const regular = regularInnings(state);
	const toss = state.toss;
	const first = toss.decision === "BAT" ? toss.winnerTeamId : otherTeam(state, toss.winnerTeamId);
	const total = rules.inningsPerSide * 2;

	if (regular.length < total) {
		const n = regular.length;
		const regularNext = (battingTeamId: TeamId, followOn = false): NextInnings => ({
			battingTeamId,
			kind: "REGULAR",
			superOverRound: null,
			followOn,
		});
		if (n === 0) return regularNext(first);
		if (n === 1 || n === 3) {
			// The side that has batted fewer times.
			const a = must(regular[0], "first innings").battingTeamId;
			const timesA = regular.filter((i) => i.battingTeamId === a).length;
			return regularNext(timesA > n - timesA ? otherTeam(state, a) : a);
		}
		// n === 2: follow-on decision.
		if (state.followOn.available && state.followOn.enforced === null) return null;
		const followOn = state.followOn.enforced === true;
		const second = must(regular[1], "second innings").battingTeamId;
		return regularNext(followOn ? second : otherTeam(state, second), followOn);
	}

	// Super overs (R-SO-01).
	if (state.superOverRound === 0) return null;
	const round = state.superOverRound;
	const inRound = state.innings.filter((i) => i.superOverRound === round);
	if (inRound.length >= 2) return null;
	if (inRound.length === 1) {
		return {
			battingTeamId: otherTeam(state, must(inRound[0], "super over innings").battingTeamId),
			kind: "SUPER_OVER",
			superOverRound: round,
			followOn: false,
		};
	}
	const battedSecond =
		round === 1
			? must(regular[regular.length - 1], "last regular innings").battingTeamId
			: must(state.innings.filter((i) => i.superOverRound === round - 1)[1], "previous super over")
					.battingTeamId;
	return {
		battingTeamId: battedSecond,
		kind: "SUPER_OVER",
		superOverRound: round,
		followOn: false,
	};
}

/** A tie in regulation or in the latest super over that the tie-breaker must resolve. */
export function tieBreakPending(state: MatchState): "SUPER_OVER" | "BOWL_OUT" | null {
	const rules = requireRules(state);
	if (state.result !== null || state.provisionalResult !== null) return null;
	if (!regulationTied(state)) return null;
	if (rules.tieBreaker === "BOWL_OUT") return state.bowlOutWinnerId === null ? "BOWL_OUT" : null;
	if (rules.tieBreaker === "NONE") return null;
	const round = state.superOverRound;
	if (round === 0) return "SUPER_OVER";
	const inRound = state.innings.filter((i) => i.superOverRound === round);
	const done = inRound.length === 2 && inRound.every((i) => i.status === "COMPLETE");
	return done && rules.tieBreaker === "SUPER_OVER_REPEAT" ? "SUPER_OVER" : null;
}

function regulationTied(state: MatchState): boolean {
	const rules = requireRules(state);
	if (rules.inningsPerSide !== 1) return false;
	const regular = regularInnings(state);
	if (regular.length !== 2 || regular.some((i) => i.status !== "COMPLETE")) return false;
	const second = must(regular[1], "second innings");
	return second.runs === must(second.target, "target") - 1;
}

/** R-RES-01..04: the result implied by play so far, or null if undecided. */
export function computeResult(state: MatchState): MatchResult | null {
	const rules = requireRules(state);
	const regular = regularInnings(state);
	if (regular.some((i) => i.status !== "COMPLETE" || i.closeReason === "MATCH_ENDED")) return null;

	if (rules.inningsPerSide === 2) return multiDayResult(state, regular);

	if (regular.length < 2) return null;
	const chase = must(regular[1], "second innings");
	const target = must(chase.target, "target");
	const method = chase.targetRevised ? "TARGET_REVISION" : "NORMAL";
	if (chase.runs >= target) return winByWickets(chase, method);
	if (chase.runs < target - 1) {
		return {
			kind: "WIN",
			winnerTeamId: chase.bowlingTeamId,
			margin: { type: "RUNS", runs: target - 1 - chase.runs },
			method,
		};
	}
	return tieBreakResult(state);
}

function winByWickets(chase: InningsState, method: "NORMAL" | "TARGET_REVISION"): MatchResult {
	return {
		kind: "WIN",
		winnerTeamId: chase.battingTeamId,
		margin: {
			type: "WICKETS",
			wickets: chase.maxWickets - chase.wickets,
			ballsRemaining:
				chase.maxOvers === null ? null : chase.maxOvers * chase.ballsPerOver - ballsUsed(chase),
		},
		method,
	};
}

function tieBreakResult(state: MatchState): MatchResult | null {
	const rules = requireRules(state);
	switch (rules.tieBreaker) {
		case "NONE":
			return { kind: "TIE" };
		case "BOWL_OUT":
			return state.bowlOutWinnerId === null
				? null
				: {
						kind: "WIN",
						winnerTeamId: state.bowlOutWinnerId,
						margin: { type: "NONE" },
						method: "BOWL_OUT",
					};
		default: {
			const round = state.superOverRound;
			const inRound = state.innings.filter((i) => i.superOverRound === round);
			if (round === 0 || inRound.length < 2 || inRound.some((i) => i.status !== "COMPLETE"))
				return null;
			const chase = must(inRound[1], "super over chase");
			const target = must(chase.target, "super over target");
			if (chase.runs >= target) {
				return {
					kind: "WIN",
					winnerTeamId: chase.battingTeamId,
					margin: { type: "NONE" },
					method: "SUPER_OVER",
				};
			}
			if (chase.runs < target - 1) {
				return {
					kind: "WIN",
					winnerTeamId: chase.bowlingTeamId,
					margin: { type: "NONE" },
					method: "SUPER_OVER",
				};
			}
			if (rules.tieBreaker === "SUPER_OVER") return { kind: "TIE" };
			if (rules.tieBreaker === "SUPER_OVER_REPEAT") return null;
			// SUPER_OVER_THEN_BOUNDARY_COUNT (R-RES-03, 2019 rule).
			const count = (teamId: TeamId): number =>
				state.innings
					.filter((i) => i.battingTeamId === teamId)
					.reduce((n, i) => n + i.boundaries, 0);
			const a = count(chase.battingTeamId);
			const b = count(chase.bowlingTeamId);
			if (a === b) return { kind: "TIE" };
			return {
				kind: "WIN",
				winnerTeamId: a > b ? chase.battingTeamId : chase.bowlingTeamId,
				margin: { type: "NONE" },
				method: "BOUNDARY_COUNT",
			};
		}
	}
}

function multiDayResult(state: MatchState, regular: InningsState[]): MatchResult | null {
	if (regular.length === 3) {
		// R-MD-05: the side that has batted twice is still behind → innings victory.
		const third = must(regular[2], "third innings");
		const twice = third.battingTeamId;
		const once = otherTeam(state, twice);
		const behind = aggregate(state, once) - aggregate(state, twice);
		if (behind > 0) {
			return {
				kind: "WIN",
				winnerTeamId: once,
				margin: { type: "INNINGS", runs: behind },
				method: "NORMAL",
			};
		}
		return null;
	}
	if (regular.length < 4) return null;
	const fourth = must(regular[3], "fourth innings");
	const chasing = fourth.battingTeamId;
	const other = otherTeam(state, chasing);
	const diff = aggregate(state, other) - aggregate(state, chasing);
	if (fourth.closeReason === "TARGET") return winByWickets(fourth, "NORMAL");
	if (diff > 0)
		return {
			kind: "WIN",
			winnerTeamId: other,
			margin: { type: "RUNS", runs: diff },
			method: "NORMAL",
		};
	// Scores level and the side batting last is out (R-RES-04).
	return { kind: "TIE" };
}
