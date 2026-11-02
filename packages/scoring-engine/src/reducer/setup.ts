/** Match setup and innings starts (CRICKET_RULES.md §4, §10, §11). */
import { violation } from "../errors";
import { must } from "../internal/must";
import { validateRules } from "../rules/presets";
import type {
	BowlOutResultEvent,
	FollowOnEvent,
	InningsStartedEvent,
	MatchStartedEvent,
	SuperOverStartedEvent,
	TossEvent,
} from "../types/events";
import type { InningsState, MatchState, PlayerState } from "../types/state";
import {
	bowlerEligibility,
	eligibleBatters,
	isTeam,
	otherTeam,
	requireRules,
	superOverBarredBatters,
} from "./context";
import {
	afterInningsClosed,
	baseTarget,
	checkInningsEnd,
	nextInnings,
	tieBreakPending,
} from "./innings";
import { startOver } from "./overs";
import { newBatterLine, startPartnership } from "./wickets";

export function applyMatchStarted(state: MatchState, event: MatchStartedEvent): void {
	if (state.status !== "NOT_STARTED")
		violation("ALREADY_STARTED", "R-LC-01", "The match has already started");
	const { rules, teams } = event.payload;
	validateRules(rules);
	if (teams[0].teamId === teams[1].teamId)
		violation("SAME_TEAM", "R-INN-01", "A team cannot play itself");
	const players: Record<string, PlayerState> = {};
	for (const sheet of teams) {
		if (sheet.playingXI.length !== rules.playersPerSide) {
			violation(
				"WRONG_XI_SIZE",
				"R-INN-01",
				`${sheet.name} must name exactly ${rules.playersPerSide} players`,
			);
		}
		const add = (id: string, name: string, role: PlayerState["role"]): void => {
			if (Object.hasOwn(players, id))
				violation("DUPLICATE_PLAYER", "R-INN-01", `Player ${id} is listed twice`);
			players[id] = {
				id,
				name,
				teamId: sheet.teamId,
				role,
				replacesId: null,
				replacedById: null,
				substitutionKind: null,
			};
		};
		for (const p of sheet.playingXI) add(p.id, p.name, "XI");
		for (const p of sheet.substitutes) add(p.id, p.name, "SUBSTITUTE");
		const inXI = (id: string): boolean => sheet.playingXI.some((p) => p.id === id);
		if (!inXI(sheet.captainId) || !inXI(sheet.wicketKeeperId)) {
			violation(
				"CAPTAIN_OR_KEEPER_NOT_IN_XI",
				"R-INN-01",
				`${sheet.name}: captain and keeper must be in the XI`,
			);
		}
		state.keepers[sheet.teamId] = sheet.wicketKeeperId;
		state.pendingPenaltyRuns[sheet.teamId] = 0;
		state.impactSubstitutionsUsed[sheet.teamId] = 0;
	}
	state.status = "IN_PROGRESS";
	state.rules = rules;
	state.teams = teams;
	state.players = players;
}

export function applyToss(state: MatchState, event: TossEvent): void {
	requireRules(state);
	if (state.toss !== null)
		violation("TOSS_ALREADY_RECORDED", "R-LC-01", "The toss has already been recorded");
	if (!isTeam(state, event.payload.winnerTeamId))
		violation("UNKNOWN_TEAM", "R-LC-01", "Unknown team");
	state.toss = event.payload;
}

export function applyInningsStarted(state: MatchState, event: InningsStartedEvent): void {
	const rules = requireRules(state);
	if (state.toss === null) violation("TOSS_REQUIRED", "R-LC-01", "Record the toss first");
	if (state.interrupted) violation("PLAY_INTERRUPTED", "R-TR-01", "Play is interrupted");
	const plan = nextInnings(state);
	if (plan === null) violation("NO_INNINGS_DUE", "R-LC-02", "No innings is due now");
	const { battingTeamId, strikerId, nonStrikerId, bowlerId } = event.payload;
	if (battingTeamId !== plan.battingTeamId) {
		violation(
			"WRONG_BATTING_TEAM",
			plan.kind === "SUPER_OVER" ? "R-SO-01" : "R-MD-01",
			`${plan.battingTeamId} bats next`,
		);
	}
	const superOver = plan.kind === "SUPER_OVER";
	const inn: InningsState = {
		index: state.innings.length,
		kind: plan.kind,
		superOverRound: plan.superOverRound,
		battingTeamId,
		bowlingTeamId: otherTeam(state, battingTeamId),
		runs: 0,
		wickets: 0,
		legalBalls: 0,
		completedOvers: 0,
		extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
		batters: [],
		bowlers: [],
		strikerId: null,
		nonStrikerId: null,
		soloBatting: false,
		currentOver: null,
		overs: [],
		fallOfWickets: [],
		partnerships: [],
		pendingPartnershipRuns: 0,
		penaltyRunsOutsidePlay: 0,
		freeHit: false,
		status: "IN_PROGRESS",
		closeReason: null,
		maxOvers: superOver
			? 1
			: (state.pendingTarget?.overs ?? state.nextInningsMaxOvers ?? rules.oversPerInnings),
		initialMaxOvers: null,
		ballsPerOver: superOver ? rules.superOverBalls : rules.ballsPerOver,
		maxWickets: superOver
			? rules.superOverWickets
			: rules.lastManStands
				? rules.playersPerSide
				: rules.playersPerSide - 1,
		target: null,
		targetRevised: false,
		followOn: plan.followOn,
		boundaries: 0,
		suspendedBowlerIds: [],
		reductions: [],
	};
	inn.initialMaxOvers = inn.maxOvers;
	state.innings.push(inn);
	state.nextInningsMaxOvers = null;

	if (strikerId === nonStrikerId)
		violation("SAME_OPENERS", "R-INN-01", "Openers must be two different players");
	const eligible = eligibleBatters(state, inn);
	for (const id of [strikerId, nonStrikerId]) {
		if (!eligible.includes(id)) {
			const barred = superOverBarredBatters(state, inn).includes(id);
			violation(
				"BATTER_NOT_ELIGIBLE",
				barred ? "R-SO-02" : "R-DIS-09",
				`${id} cannot open the batting`,
			);
		}
	}
	const check = bowlerEligibility(state, inn, bowlerId, false);
	if (!check.eligible)
		violation(
			`BOWLER_${check.reason}`,
			check.reason === "BOWLED_PREVIOUS_SUPER_OVER" ? "R-SO-03" : "R-OV-05",
			`${bowlerId} cannot bowl: ${check.reason}`,
		);

	newBatterLine(inn, strikerId);
	newBatterLine(inn, nonStrikerId);
	inn.strikerId = strikerId;
	inn.nonStrikerId = nonStrikerId;
	// Penalty runs awarded before this side batted (R-EXT-09, Law 41.17).
	const pending = must(state.pendingPenaltyRuns[battingTeamId], "penalty tally");
	if (pending > 0) {
		inn.runs += pending;
		inn.extras.penalties += pending;
		inn.penaltyRunsOutsidePlay += pending;
		state.pendingPenaltyRuns[battingTeamId] = 0;
	}
	startPartnership(inn, strikerId, nonStrikerId);
	startOver(inn, bowlerId);

	if (state.pendingTarget !== null && !superOver) {
		inn.target = state.pendingTarget.target;
		inn.targetRevised = true;
		state.pendingTarget = null;
	} else {
		inn.target = baseTarget(state, inn);
	}
	checkInningsEnd(state, inn);
}

/** INNINGS_ENDED { FORFEITED } before an innings starts (R-MD-02, Law 15.2). */
export function applyForfeit(state: MatchState): void {
	const rules = requireRules(state);
	if (rules.inningsPerSide !== 2)
		violation("FORFEIT_NOT_ALLOWED", "R-MD-02", "Only multi-day innings can be forfeited");
	const plan = nextInnings(state);
	if (plan === null) violation("NO_INNINGS_DUE", "R-MD-02", "No innings is due now");
	state.innings.push({
		index: state.innings.length,
		kind: "REGULAR",
		superOverRound: null,
		battingTeamId: plan.battingTeamId,
		bowlingTeamId: otherTeam(state, plan.battingTeamId),
		runs: 0,
		wickets: 0,
		legalBalls: 0,
		completedOvers: 0,
		extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 },
		batters: [],
		bowlers: [],
		strikerId: null,
		nonStrikerId: null,
		soloBatting: false,
		currentOver: null,
		overs: [],
		fallOfWickets: [],
		partnerships: [],
		pendingPartnershipRuns: 0,
		penaltyRunsOutsidePlay: 0,
		freeHit: false,
		status: "COMPLETE",
		closeReason: "FORFEITED",
		maxOvers: null,
		initialMaxOvers: null,
		ballsPerOver: rules.ballsPerOver,
		maxWickets: rules.playersPerSide - 1,
		target: null,
		targetRevised: false,
		followOn: plan.followOn,
		boundaries: 0,
		suspendedBowlerIds: [],
		reductions: [],
	});
	afterInningsClosed(state);
}

export function applyFollowOn(state: MatchState, event: FollowOnEvent): void {
	if (!state.followOn.available || state.followOn.enforced !== null) {
		violation("FOLLOW_ON_NOT_AVAILABLE", "R-MD-04", "The follow-on is not available");
	}
	state.followOn.enforced = event.payload.enforced;
}

export function applySuperOverStarted(state: MatchState, event: SuperOverStartedEvent): void {
	if (tieBreakPending(state) !== "SUPER_OVER") {
		violation("NO_SUPER_OVER_DUE", "R-RES-03", "A super over is not due");
	}
	if (event.payload.round !== state.superOverRound + 1) {
		violation("WRONG_ROUND", "R-RES-03", `Expected super over round ${state.superOverRound + 1}`);
	}
	state.superOverRound = event.payload.round;
}

export function applyBowlOutResult(state: MatchState, event: BowlOutResultEvent): void {
	if (tieBreakPending(state) !== "BOWL_OUT")
		violation("NO_BOWL_OUT_DUE", "R-RES-03", "A bowl-out is not due");
	if (!isTeam(state, event.payload.winnerTeamId))
		violation("UNKNOWN_TEAM", "R-RES-03", "Unknown team");
	state.bowlOutWinnerId = event.payload.winnerTeamId;
	afterInningsClosed(state);
}
