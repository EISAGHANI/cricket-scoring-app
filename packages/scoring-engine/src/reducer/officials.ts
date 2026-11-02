/**
 * Events typically entered by or on behalf of match officials: penalty runs, strike overrides,
 * declarations, interruptions, target revision, substitutions and the result.
 */
import { violation } from "../errors";
import { must } from "../internal/must";
import {
	arrTarget,
	dlsPar,
	dlsTarget,
	inningsResources,
	mpoTarget,
	resources,
	type ResourceTable,
} from "../target-revision/strategies";
import type {
	DeclarationEvent,
	InterruptionEvent,
	MatchResultEvent,
	PenaltyRunsEvent,
	PlayResumedEvent,
	SubstitutionEvent,
	SwapStrikeEvent,
	TargetRevisedEvent,
} from "../types/events";
import type { MatchResult } from "../types/results";
import type { InningsState, MatchState, OversReduction } from "../types/state";
import {
	atCrease,
	ballsUsed,
	currentBowlerId,
	currentInnings,
	isTeam,
	player,
	requireInnings,
	requireRules,
} from "./context";
import {
	closeInnings,
	checkInningsEnd,
	computeResult,
	refreshTargets,
	regularInnings,
} from "./innings";
import { openPartnership } from "./wickets";

export interface EngineOptions {
	/** Resource table for the DLS Standard-style strategy (ADR-0013). */
	resourceTable?: ResourceTable | undefined;
}

export function applyPenaltyRuns(state: MatchState, event: PenaltyRunsEvent): void {
	const { toTeamId, runs } = event.payload;
	if (!isTeam(state, toTeamId)) violation("UNKNOWN_TEAM", "R-EXT-09", "Unknown team");
	if (!Number.isInteger(runs) || runs < 1 || runs > 20)
		violation("INVALID_RUNS", "R-EXT-09", "Invalid penalty runs");
	const inn = currentInnings(state);
	if (inn !== null && inn.battingTeamId === toTeamId) {
		inn.runs += runs;
		inn.extras.penalties += runs;
		const open = openPartnership(inn);
		if (open !== null) open.runs += runs;
		else inn.pendingPartnershipRuns += runs;
		checkInningsEnd(state, inn);
		return;
	}
	// R-EXT-09: to the side's most recent completed innings, else its next innings.
	const completed = regularInnings(state).filter(
		(i) => i.battingTeamId === toTeamId && i.status === "COMPLETE",
	);
	const target = completed[completed.length - 1];
	if (target === undefined) {
		state.pendingPenaltyRuns[toTeamId] = (state.pendingPenaltyRuns[toTeamId] ?? 0) + runs;
	} else {
		target.runs += runs;
		target.extras.penalties += runs;
		target.penaltyRunsOutsidePlay += runs;
	}
	refreshTargets(state);
	if (inn === null) state.provisionalResult = computeResult(state);
}

export function applySwapStrike(state: MatchState, _event: SwapStrikeEvent): void {
	const inn = requireInnings(state);
	if (inn.strikerId === null || inn.nonStrikerId === null) {
		violation("CANNOT_SWAP", "R-STR-06", "Both batters must be at the crease");
	}
	[inn.strikerId, inn.nonStrikerId] = [inn.nonStrikerId, inn.strikerId];
}

export function applyDeclaration(state: MatchState, event: DeclarationEvent): void {
	const rules = requireRules(state);
	const inn = requireInnings(state);
	if (rules.inningsPerSide !== 2 || inn.kind !== "REGULAR") {
		violation(
			"DECLARATION_NOT_ALLOWED",
			"R-INN-03",
			"Declarations are only allowed in multi-day matches",
		);
	}
	if (event.payload.teamId !== inn.battingTeamId) {
		violation("NOT_BATTING_TEAM", "R-INN-03", "Only the batting side can declare");
	}
	closeInnings(state, inn, "DECLARED");
}

export function applyInterruption(state: MatchState, event: InterruptionEvent): void {
	requireRules(state);
	if (state.interrupted) violation("ALREADY_INTERRUPTED", "R-TR-01", "Play is already interrupted");
	const inn = currentInnings(state);
	state.interrupted = true;
	state.interruptions.push({
		kind: event.payload.kind,
		inningsIndex: inn?.index ?? null,
		legalBalls: inn?.legalBalls ?? 0,
		wickets: inn?.wickets ?? 0,
		revisedOvers: null,
		resumed: false,
	});
}

function oversInUse(inn: InningsState): number {
	return Math.ceil(ballsUsed(inn) / inn.ballsPerOver);
}

export function applyPlayResumed(state: MatchState, event: PlayResumedEvent): void {
	const rules = requireRules(state);
	if (!state.interrupted) violation("NOT_INTERRUPTED", "R-TR-01", "Play is not interrupted");
	const { revisedOvers, revisedBowlerMaxOvers } = event.payload;
	const record = must(state.interruptions[state.interruptions.length - 1], "interruption");
	const inn = currentInnings(state);
	if (revisedOvers !== null) {
		if (rules.oversPerInnings === null)
			violation(
				"NOT_LIMITED_OVERS",
				"R-TR-01",
				"Overs can only be revised in limited-overs matches",
			);
		if (
			!Number.isInteger(revisedOvers) ||
			revisedOvers < 1 ||
			revisedOvers > rules.oversPerInnings
		) {
			violation("INVALID_OVERS", "R-TR-01", "Invalid revised overs");
		}
		if (inn !== null) {
			if (revisedOvers < oversInUse(inn))
				violation("INVALID_OVERS", "R-TR-01", "Overs already bowled exceed the revised limit");
			inn.reductions.push(reduction(inn, revisedOvers));
			inn.maxOvers = revisedOvers;
		} else {
			state.nextInningsMaxOvers = revisedOvers;
		}
	}
	if (revisedBowlerMaxOvers !== null) {
		if (!Number.isInteger(revisedBowlerMaxOvers) || revisedBowlerMaxOvers < 1) {
			violation("INVALID_OVERS", "R-TR-01", "Invalid bowler quota");
		}
		state.bowlerMaxOversOverride = revisedBowlerMaxOvers;
	}
	record.revisedOvers = revisedOvers;
	record.resumed = true;
	if (record.kind === "STUMPS") state.day++;
	state.interrupted = false;
	if (inn !== null) checkInningsEnd(state, inn);
}

function reduction(inn: InningsState, oversAfter: number): OversReduction {
	return {
		legalBalls: ballsUsed(inn),
		wickets: inn.wickets,
		oversBefore: must(inn.maxOvers, "max overs"),
		oversAfter,
	};
}

/** The innings pair a target revision applies to (limited overs only). */
function chaseContext(state: MatchState): { first: InningsState; chase: InningsState | null } {
	const rules = requireRules(state);
	const regular = regularInnings(state);
	const first = regular[0];
	const ok = rules.inningsPerSide === 1 && first !== undefined && first.status === "COMPLETE";
	const chase = regular[1] ?? null;
	if (!ok || (chase !== null && chase.status !== "IN_PROGRESS")) {
		violation("NO_CHASE", "R-TR-02", "Targets can only be revised for the side batting second");
	}
	return { first, chase };
}

/** Team 1's overs for rate-based strategies: the full allocation when all out (R-TR-03). */
function team1Overs(first: InningsState): number {
	if (first.closeReason === "ALL_OUT") return must(first.maxOvers, "max overs");
	return ballsUsed(first) / first.ballsPerOver;
}

export function computeRevisedTarget(
	state: MatchState,
	overs: number,
	options: EngineOptions,
): number {
	const rules = requireRules(state);
	const { first, chase } = chaseContext(state);
	switch (rules.targetRevision) {
		case "MANUAL":
			return violation(
				"MANUAL_TARGET",
				"R-TR-07",
				"Targets for this match are set manually (override: true)",
			);
		case "ARR":
			return arrTarget(first.runs, team1Overs(first), overs);
		case "MPO":
			return mpoTarget(
				first.overs.map((o) => o.runs),
				overs,
			);
		case "DLS_STANDARD": {
			const table = options.resourceTable;
			if (table === undefined) {
				return violation(
					"NO_RESOURCE_TABLE",
					"R-TR-05",
					"No resource table is configured (ADR-0013)",
				);
			}
			const r1 = inningsResources(table, {
				initialOvers: must(first.initialMaxOvers, "initial overs"),
				ballsPerOver: first.ballsPerOver,
				reductions: first.reductions,
			});
			const r2 = inningsResources(table, {
				initialOvers: chase === null ? overs : must(chase.initialMaxOvers, "initial overs"),
				ballsPerOver: rules.ballsPerOver,
				reductions:
					chase === null || chase.maxOvers === overs
						? (chase?.reductions ?? [])
						: [...chase.reductions, reduction(chase, overs)],
			});
			return dlsTarget(first.runs, r1, r2, must(rules.dlsG50, "G50"));
		}
	}
}

export function applyTargetRevised(
	state: MatchState,
	event: TargetRevisedEvent,
	options: EngineOptions,
): void {
	const rules = requireRules(state);
	const { target, overs, override } = event.payload;
	const { chase } = chaseContext(state);
	const maxOvers = must(rules.oversPerInnings, "overs per innings");
	if (!Number.isInteger(overs) || overs < 1 || overs > maxOvers)
		violation("INVALID_OVERS", "R-TR-02", "Invalid overs");
	if (!Number.isInteger(target) || target < 1)
		violation("INVALID_TARGET", "R-TR-02", "Invalid target");
	if (chase !== null && overs < oversInUse(chase)) {
		violation("INVALID_OVERS", "R-TR-02", "Overs already bowled exceed the revised limit");
	}
	if (!override) {
		const expected = computeRevisedTarget(state, overs, options);
		if (expected !== target) {
			violation(
				"TARGET_MISMATCH",
				"R-TR-02",
				`The ${rules.targetRevision} target is ${expected}, not ${target}`,
			);
		}
	}
	if (chase === null) {
		state.pendingTarget = { target, overs };
		return;
	}
	if (chase.maxOvers !== overs) chase.reductions.push(reduction(chase, overs));
	chase.maxOvers = overs;
	chase.target = target;
	chase.targetRevised = true;
	checkInningsEnd(state, chase);
}

/** Par score for the chasing side right now (R-TR-06). null when not computable. */
export function parScore(state: MatchState, options: EngineOptions = {}): number | null {
	const rules = requireRules(state);
	const regular = regularInnings(state);
	const first = regular[0];
	const chase = regular[1];
	if (rules.inningsPerSide !== 1 || first === undefined || chase === undefined) return null;
	const used = ballsUsed(chase) / chase.ballsPerOver;
	switch (rules.targetRevision) {
		case "MANUAL":
			return null;
		case "ARR":
			return arrTarget(first.runs, team1Overs(first), used) - 1;
		case "MPO":
			return (
				mpoTarget(
					first.overs.map((o) => o.runs),
					Math.ceil(used),
				) - 1
			);
		case "DLS_STANDARD": {
			const table = options.resourceTable;
			if (table === undefined) return null;
			const r1 = inningsResources(table, {
				initialOvers: must(first.initialMaxOvers, "initial overs"),
				ballsPerOver: first.ballsPerOver,
				reductions: first.reductions,
			});
			const r2 = inningsResources(table, {
				initialOvers: must(chase.initialMaxOvers, "initial overs"),
				ballsPerOver: chase.ballsPerOver,
				reductions: chase.reductions,
			});
			const remaining = resources(table, must(chase.maxOvers, "max overs") - used, chase.wickets);
			return dlsPar(first.runs, r1, r2 - remaining, must(rules.dlsG50, "G50"));
		}
	}
}

/** R-TR-08: result if no further play is possible during the chase. */
export function resultIfNoMorePlay(state: MatchState, options: EngineOptions): MatchResult | null {
	const rules = requireRules(state);
	const chase = currentInnings(state);
	const regular = regularInnings(state);
	if (
		rules.inningsPerSide !== 1 ||
		rules.minOversForResult === null ||
		chase === null ||
		chase !== regular[1]
	) {
		return null;
	}
	if (ballsUsed(chase) < rules.minOversForResult * chase.ballsPerOver) return { kind: "NO_RESULT" };
	const par = parScore(state, options);
	if (par === null) return null;
	if (chase.runs > par) {
		return {
			kind: "WIN",
			winnerTeamId: chase.battingTeamId,
			margin: { type: "WICKETS", wickets: chase.maxWickets - chase.wickets, ballsRemaining: null },
			method: "TARGET_REVISION",
		};
	}
	if (chase.runs < par) {
		return {
			kind: "WIN",
			winnerTeamId: chase.bowlingTeamId,
			margin: { type: "RUNS", runs: par - chase.runs },
			method: "TARGET_REVISION",
		};
	}
	return { kind: "TIE" };
}

function sameResult(a: MatchResult, b: MatchResult): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export function applyMatchResult(
	state: MatchState,
	event: MatchResultEvent,
	options: EngineOptions,
): void {
	const rules = requireRules(state);
	const { result, override } = event.payload;
	if (result.kind === "WIN" && !isTeam(state, result.winnerTeamId)) {
		violation("UNKNOWN_TEAM", "R-RES-06", "Unknown winning team");
	}
	const expected = state.provisionalResult ?? resultIfNoMorePlay(state, options);
	if (!override) {
		if (expected !== null) {
			if (!sameResult(expected, result)) {
				violation(
					"RESULT_MISMATCH",
					"R-RES-06",
					`The computed result is ${JSON.stringify(expected)}`,
				);
			}
		} else {
			const declarative =
				result.kind === "NO_RESULT" ||
				result.kind === "ABANDONED" ||
				(result.kind === "DRAW" && rules.inningsPerSide === 2) ||
				(result.kind === "WIN" && ["FORFEIT", "AWARDED", "CONCEDED"].includes(result.method));
			if (!declarative) {
				violation("RESULT_NOT_DETERMINED", "R-RES-05", "This result needs an officials' override");
			}
		}
	}
	const inn = currentInnings(state);
	if (inn !== null) closeInnings(state, inn, "MATCH_ENDED");
	state.result = result;
	state.provisionalResult = null;
	state.status = "COMPLETE";
}

export function applySubstitution(state: MatchState, event: SubstitutionEvent): void {
	const rules = requireRules(state);
	const { kind, teamId, outPlayerId, inPlayerId } = event.payload;
	const out = player(state, outPlayerId);
	const incoming = player(state, inPlayerId);
	if (out === null || incoming === null || out.teamId !== teamId || incoming.teamId !== teamId) {
		violation("UNKNOWN_PLAYER", "R-SUB-01", "Both players must belong to the team");
	}
	if (out.role !== "XI" || incoming.role !== "SUBSTITUTE") {
		violation("INVALID_SUBSTITUTION", "R-SUB-01", "A substitute must replace a player in the XI");
	}
	if (kind === "FIELDING") return; // R-SUB-01: substitutes may field without changing the XI.

	if (kind === "CONCUSSION" && !rules.concussionReplacements) {
		violation("NOT_ALLOWED", "R-SUB-02", "Concussion replacements are not enabled");
	}
	if (
		kind === "IMPACT" &&
		(state.impactSubstitutionsUsed[teamId] ?? 0) >= rules.impactPlayersPerTeam
	) {
		violation("NOT_ALLOWED", "R-SUB-03", "No impact-player substitutions remain");
	}
	const inn = currentInnings(state);
	if (inn !== null && atCrease(inn, outPlayerId)) {
		violation("PLAYER_AT_CREASE", "R-SUB-02", "A batter at the crease must retire first");
	}
	if (inn !== null && inn.currentOver !== null && currentBowlerId(inn) === outPlayerId) {
		violation("PLAYER_BOWLING", "R-SUB-02", "Change the bowler before replacing them");
	}
	out.role = "REPLACED";
	out.replacedById = inPlayerId;
	incoming.role = "XI";
	incoming.replacesId = outPlayerId;
	incoming.substitutionKind = kind;
	if (state.keepers[teamId] === outPlayerId) state.keepers[teamId] = inPlayerId;
	if (kind === "IMPACT")
		state.impactSubstitutionsUsed[teamId] = (state.impactSubstitutionsUsed[teamId] ?? 0) + 1;
}
