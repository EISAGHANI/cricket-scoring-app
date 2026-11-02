/** The reducer entry point: applyEvent, awaiting, initialState (CRICKET_RULES.md §4). */
import { RuleViolation, assertNever, violation } from "../errors";
import { clone } from "../internal/clone";
import type { PlayEvent, PlayEventType } from "../types/events";
import type { MatchState } from "../types/state";
import { currentInnings, needsBatter, needsBowler, overDue } from "./context";
import { applyDelivery } from "./delivery";
import { nextInnings, tieBreakPending } from "./innings";
import {
	applyDeclaration,
	applyInterruption,
	applyMatchResult,
	applyPenaltyRuns,
	applyPlayResumed,
	applySubstitution,
	applySwapStrike,
	applyTargetRevised,
	type EngineOptions,
} from "./officials";
import { applyBowlerChange, applyEndOfOver } from "./overs";
import {
	applyBowlOutResult,
	applyFollowOn,
	applyForfeit,
	applyInningsStarted,
	applyMatchStarted,
	applySuperOverStarted,
	applyToss,
} from "./setup";
import { applyBatterIn, applyRetirement, applyWicket, endInningsNoBatters } from "./wickets";

export function initialState(): MatchState {
	return {
		status: "NOT_STARTED",
		lastSeq: 0,
		rules: null,
		teams: null,
		players: {},
		keepers: {},
		toss: null,
		innings: [],
		followOn: { available: false, enforced: null },
		superOverRound: 0,
		bowlOutWinnerId: null,
		interruptions: [],
		interrupted: false,
		day: 1,
		nextInningsMaxOvers: null,
		pendingTarget: null,
		bowlerMaxOversOverride: null,
		pendingPenaltyRuns: {},
		impactSubstitutionsUsed: {},
		provisionalResult: null,
		result: null,
	};
}

/** Mutates `draft` in place. Callers own the draft (see applyEvent / replay). */
export function reduceInPlace(draft: MatchState, event: PlayEvent, options: EngineOptions): void {
	if (!Number.isInteger(event.seq) || event.seq <= draft.lastSeq) {
		violation(
			"OUT_OF_ORDER",
			"R-LC-06",
			`Event seq ${event.seq} must be greater than ${draft.lastSeq}`,
		);
	}
	if (draft.status === "COMPLETE") violation("MATCH_COMPLETE", "R-LC-02", "The match is complete");
	if (draft.status === "NOT_STARTED" && event.type !== "MATCH_STARTED") {
		violation("MATCH_NOT_STARTED", "R-LC-01", "The first event must be MATCH_STARTED");
	}
	switch (event.type) {
		case "MATCH_STARTED":
			applyMatchStarted(draft, event);
			break;
		case "TOSS":
			applyToss(draft, event);
			break;
		case "INNINGS_STARTED":
			applyInningsStarted(draft, event);
			break;
		case "DELIVERY":
			applyDelivery(draft, event);
			break;
		case "WICKET":
			applyWicket(draft, event);
			break;
		case "BATTER_IN":
			applyBatterIn(draft, event);
			break;
		case "BOWLER_CHANGE":
			applyBowlerChange(draft, event);
			break;
		case "END_OF_OVER":
			applyEndOfOver(draft, event);
			break;
		case "PENALTY_RUNS":
			applyPenaltyRuns(draft, event);
			break;
		case "RETIREMENT":
			applyRetirement(draft, event);
			break;
		case "SUBSTITUTION":
			applySubstitution(draft, event);
			break;
		case "SWAP_STRIKE":
			applySwapStrike(draft, event);
			break;
		case "DECLARATION":
			applyDeclaration(draft, event);
			break;
		case "FOLLOW_ON":
			applyFollowOn(draft, event);
			break;
		case "INTERRUPTION":
			applyInterruption(draft, event);
			break;
		case "PLAY_RESUMED":
			applyPlayResumed(draft, event);
			break;
		case "TARGET_REVISED":
			applyTargetRevised(draft, event, options);
			break;
		case "INNINGS_ENDED":
			if (event.payload.reason === "FORFEITED") applyForfeit(draft);
			else endInningsNoBatters(draft);
			break;
		case "SUPER_OVER_STARTED":
			applySuperOverStarted(draft, event);
			break;
		case "BOWL_OUT_RESULT":
			applyBowlOutResult(draft, event);
			break;
		case "MATCH_RESULT":
			applyMatchResult(draft, event, options);
			break;
		default:
			assertNever(event);
	}
	draft.lastSeq = event.seq;
}

/**
 * Apply one event. Pure: the input state is never modified (R-LC-03/04).
 * Throws RuleViolation (with the event's seq) if the event is not allowed.
 */
export function applyEvent(
	state: MatchState,
	event: PlayEvent,
	options: EngineOptions = {},
): MatchState {
	const draft = clone(state);
	try {
		reduceInPlace(draft, event, options);
	} catch (error) {
		throw withSeq(error, event.seq);
	}
	return draft;
}

export type ApplyResult = { ok: true; state: MatchState } | { ok: false; error: RuleViolation };

export function tryApplyEvent(
	state: MatchState,
	event: PlayEvent,
	options: EngineOptions = {},
): ApplyResult {
	try {
		return { ok: true, state: applyEvent(state, event, options) };
	} catch (error) {
		if (error instanceof RuleViolation) return { ok: false, error };
		throw error;
	}
}

export function withSeq(error: unknown, seq: number): unknown {
	if (error instanceof RuleViolation && error.seq === null) {
		return new RuleViolation(error.code, error.rule, error.message, seq);
	}
	return error;
}

/**
 * Event types that may be accepted next (R-LC-02). Advisory: it narrows what a UI offers, and
 * applyEvent remains the authority on whether a specific event is valid.
 */
export function awaiting(state: MatchState): PlayEventType[] {
	if (state.status === "NOT_STARTED") return ["MATCH_STARTED"];
	if (state.status === "COMPLETE") return [];
	if (state.toss === null) return ["TOSS", "MATCH_RESULT"];
	const always: PlayEventType[] = ["MATCH_RESULT", "PENALTY_RUNS", "SUBSTITUTION"];
	if (state.interrupted) return ["PLAY_RESUMED", "TARGET_REVISED", "DECLARATION", ...always];
	const inn = currentInnings(state);
	if (inn === null) {
		const next: PlayEventType[] = ["INTERRUPTION", ...always];
		if (state.followOn.available && state.followOn.enforced === null) next.unshift("FOLLOW_ON");
		const tie = tieBreakPending(state);
		if (tie === "SUPER_OVER") next.unshift("SUPER_OVER_STARTED");
		if (tie === "BOWL_OUT") next.unshift("BOWL_OUT_RESULT");
		const plan = nextInnings(state);
		if (plan !== null) {
			next.unshift("INNINGS_STARTED");
			if (state.rules?.inningsPerSide === 2 && plan.kind === "REGULAR") next.push("INNINGS_ENDED");
			if (state.rules?.inningsPerSide === 1 && plan.kind === "REGULAR") next.push("TARGET_REVISED");
		}
		return next;
	}
	const blocking: PlayEventType[] = [];
	if (needsBatter(inn)) blocking.push("BATTER_IN", "WICKET", "INNINGS_ENDED");
	if (overDue(inn)) blocking.push("END_OF_OVER");
	if (needsBowler(inn)) blocking.push("BOWLER_CHANGE");
	const anytime: PlayEventType[] = [
		"RETIREMENT",
		"SWAP_STRIKE",
		"INTERRUPTION",
		"TARGET_REVISED",
		...always,
	];
	if (state.rules?.inningsPerSide === 2) anytime.push("DECLARATION");
	if (blocking.length > 0) return [...blocking, ...anytime];
	return ["DELIVERY", "WICKET", "BOWLER_CHANGE", "END_OF_OVER", ...anytime];
}
