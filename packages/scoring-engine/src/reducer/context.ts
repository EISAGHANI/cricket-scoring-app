/** Shared lookups and predicates used by the reducer modules. All functions are pure reads. */
import { violation } from "../errors";
import { must } from "../internal/must";
import type { PlayerId, TeamId } from "../types/ids";
import type { MatchRules } from "../types/rules";
import type { BatterLine, BowlerLine, InningsState, MatchState, PlayerState } from "../types/state";

export function requireRules(state: MatchState): MatchRules {
	if (state.rules === null)
		return violation("MATCH_NOT_STARTED", "R-LC-01", "The match has not started");
	return state.rules;
}

export function currentInnings(state: MatchState): InningsState | null {
	const last = state.innings[state.innings.length - 1];
	return last !== undefined && last.status === "IN_PROGRESS" ? last : null;
}

export function requireInnings(state: MatchState): InningsState {
	const inn = currentInnings(state);
	if (inn === null)
		return violation("NO_INNINGS_IN_PROGRESS", "R-LC-02", "No innings is in progress");
	return inn;
}

export function requireNotInterrupted(state: MatchState): void {
	if (state.interrupted) violation("PLAY_INTERRUPTED", "R-TR-01", "Play is interrupted");
}

export function teamIds(state: MatchState): [TeamId, TeamId] {
	const teams = must(state.teams, "teams");
	return [teams[0].teamId, teams[1].teamId];
}

export function otherTeam(state: MatchState, teamId: TeamId): TeamId {
	const [a, b] = teamIds(state);
	return teamId === a ? b : a;
}

export function isTeam(state: MatchState, teamId: TeamId): boolean {
	return teamIds(state).includes(teamId);
}

export function player(state: MatchState, id: PlayerId): PlayerState | null {
	return Object.hasOwn(state.players, id) ? (state.players[id] ?? null) : null;
}

/** Player is on the team and currently part of its active XI. */
export function isActive(state: MatchState, id: PlayerId, teamId: TeamId): boolean {
	const p = player(state, id);
	return p !== null && p.teamId === teamId && p.role === "XI";
}

/** Player may field (catch, run out): active XI or a listed substitute (R-SUB-01). */
export function canField(state: MatchState, id: PlayerId, teamId: TeamId): boolean {
	const p = player(state, id);
	return p !== null && p.teamId === teamId && p.role !== "REPLACED";
}

export function batterLine(inn: InningsState, id: PlayerId): BatterLine | null {
	return inn.batters.find((b) => b.playerId === id) ?? null;
}

export function bowlerLine(inn: InningsState, id: PlayerId): BowlerLine {
	let line = inn.bowlers.find((b) => b.playerId === id);
	if (line === undefined) {
		line = {
			playerId: id,
			legalBalls: 0,
			maidens: 0,
			runs: 0,
			wickets: 0,
			wides: 0,
			noBalls: 0,
			dots: 0,
			foursConceded: 0,
			sixesConceded: 0,
			oversStarted: 0,
		};
		inn.bowlers.push(line);
	}
	return line;
}

/** Undo the start of an over nobody bowled in; drop the bowler's line if it is now empty. */
export function unstartOver(inn: InningsState): void {
	const id = must(inn.currentOver?.bowlerIds[0], "bowler");
	const line = bowlerLine(inn, id);
	line.oversStarted--;
	const empty =
		line.oversStarted === 0 &&
		line.legalBalls === 0 &&
		line.runs === 0 &&
		line.wides === 0 &&
		line.noBalls === 0;
	if (empty) inn.bowlers = inn.bowlers.filter((b) => b !== line);
	inn.currentOver = null;
}

export function atCrease(inn: InningsState, id: PlayerId): boolean {
	return inn.strikerId === id || inn.nonStrikerId === id;
}

/** A crease position is empty and must be filled with BATTER_IN before the next ball. */
export function needsBatter(inn: InningsState): boolean {
	if (inn.status !== "IN_PROGRESS") return false;
	if (inn.strikerId === null) return true;
	return inn.nonStrikerId === null && !inn.soloBatting;
}

/** The over has had its full count of legal balls and END_OF_OVER is required (R-OV-01). */
export function overDue(inn: InningsState): boolean {
	return inn.currentOver !== null && inn.currentOver.legalBalls >= inn.ballsPerOver;
}

/** Between overs: BOWLER_CHANGE is required. */
export function needsBowler(inn: InningsState): boolean {
	return inn.status === "IN_PROGRESS" && inn.currentOver === null;
}

export function currentBowlerId(inn: InningsState): PlayerId | null {
	const ids = inn.currentOver?.bowlerIds;
	return ids === undefined ? null : (ids[ids.length - 1] ?? null);
}

/** Overs notation "O.B" (R-OV-07). */
export function oversText(completedOvers: number, ballsInOver: number): string {
	return `${completedOvers}.${ballsInOver}`;
}

/** Legal balls in the over in progress, or in a partial final over of a closed innings. */
export function ballsInCurrentOver(inn: InningsState): number {
	if (inn.currentOver !== null) return inn.currentOver.legalBalls;
	const last = inn.overs[inn.overs.length - 1];
	if (last === undefined || last.miscount || last.legalBalls >= inn.ballsPerOver) return 0;
	return last.legalBalls;
}

/** Balls of the over allocation consumed (miscounted overs count as full overs). */
export function ballsUsed(inn: InningsState): number {
	return inn.completedOvers * inn.ballsPerOver + ballsInCurrentOver(inn);
}

export function inningsOversText(inn: InningsState): string {
	return oversText(inn.completedOvers, ballsInCurrentOver(inn));
}

/** All players in the concussion-replacement chain ending at `id` (for quota and eligibility). */
export function replacementChain(state: MatchState, id: PlayerId): PlayerId[] {
	const chain = [id];
	let p = player(state, id);
	while (p !== null && p.substitutionKind === "CONCUSSION" && p.replacesId !== null) {
		chain.push(p.replacesId);
		p = player(state, p.replacesId);
	}
	return chain;
}

/** Players who may come in to bat now (R-DIS-09, R-SUB-02..04, R-SO-02). */
export function eligibleBatters(state: MatchState, inn: InningsState): PlayerId[] {
	const rules = requireRules(state);
	const distinct = inn.batters.length;
	const barred = superOverBarredBatters(state, inn);
	return Object.values(state.players)
		.filter((p) => p.teamId === inn.battingTeamId && p.role === "XI")
		.filter((p) => !atCrease(inn, p.id) && !barred.includes(p.id))
		.filter((p) => {
			const own = batterLine(inn, p.id);
			if (own !== null) return own.status === "RETIRED_HURT" && rules.retiredHurtMayReturn;
			// Concussion replacement inherits the replaced player's batting state (R-SUB-02).
			for (const prior of replacementChain(state, p.id).slice(1)) {
				const line = batterLine(inn, prior);
				if (line !== null && line.status === "OUT") return false;
			}
			return distinct < rules.playersPerSide;
		})
		.map((p) => p.id);
}

/** R-SO-02: batters dismissed in the previous super-over round cannot bat in the next one. */
export function superOverBarredBatters(state: MatchState, inn: InningsState): PlayerId[] {
	if (inn.kind !== "SUPER_OVER" || inn.superOverRound === null || inn.superOverRound < 2) return [];
	const round = inn.superOverRound - 1;
	const previous = must(
		state.innings.find((i) => i.superOverRound === round && i.battingTeamId === inn.battingTeamId),
		"previous super over",
	);
	return previous.batters.filter((b) => b.status === "OUT").map((b) => b.playerId);
}

/** R-SO-03: a bowler from the previous super-over round cannot bowl in the next one. */
export function superOverBarredBowlers(state: MatchState, inn: InningsState): PlayerId[] {
	if (inn.kind !== "SUPER_OVER" || inn.superOverRound === null || inn.superOverRound < 2) return [];
	const round = inn.superOverRound - 1;
	const previous = must(
		state.innings.find((i) => i.superOverRound === round && i.bowlingTeamId === inn.bowlingTeamId),
		"previous super over",
	);
	return previous.bowlers.map((b) => b.playerId);
}

export interface BowlerEligibility {
	playerId: PlayerId;
	eligible: boolean;
	reason: string | null;
}

/**
 * Why a bowler may or may not start the next over (R-OV-05, R-OV-08, R-SUB-02, R-SO-03).
 * `midOver` relaxes the quota check for completing someone else's over (R-OV-06).
 */
export function bowlerEligibility(
	state: MatchState,
	inn: InningsState,
	id: PlayerId,
	midOver: boolean,
): BowlerEligibility {
	const rules = requireRules(state);
	const no = (reason: string): BowlerEligibility => ({ playerId: id, eligible: false, reason });
	if (!isActive(state, id, inn.bowlingTeamId)) return no("NOT_IN_FIELDING_XI");
	if (inn.suspendedBowlerIds.includes(id)) return no("SUSPENDED");
	if (superOverBarredBowlers(state, inn).includes(id)) return no("BOWLED_PREVIOUS_SUPER_OVER");

	const chain = replacementChain(state, id);
	const lines = inn.bowlers.filter((b) => chain.includes(b.playerId));
	const oversStarted = lines.reduce((n, b) => n + b.oversStarted, 0);
	const legalBalls = lines.reduce((n, b) => n + b.legalBalls, 0);
	const maxOvers =
		inn.kind === "SUPER_OVER" ? null : (state.bowlerMaxOversOverride ?? rules.bowlerMaxOvers);
	const maxBalls = inn.kind === "SUPER_OVER" ? null : rules.bowlerMaxBalls;

	if (midOver) {
		const last = inn.overs[inn.overs.length - 1];
		if (last?.bowlerIds.includes(id) === true) return no("BOWLED_PREVIOUS_OVER");
		if (inn.currentOver?.bowlerIds.includes(id) === true) return no("ALREADY_IN_THIS_OVER");
		if (maxBalls !== null && legalBalls >= maxBalls) return no("QUOTA_REACHED");
		if (maxOvers !== null && legalBalls >= maxOvers * inn.ballsPerOver) return no("QUOTA_REACHED");
		return { playerId: id, eligible: true, reason: null };
	}

	if (maxOvers !== null && oversStarted >= maxOvers) return no("QUOTA_REACHED");
	if (maxBalls !== null && legalBalls + inn.ballsPerOver > maxBalls) return no("QUOTA_REACHED");

	// Consecutive overs: count the run of immediately preceding overs this bowler took part in.
	let streak = 0;
	for (let i = inn.overs.length - 1; i >= 0; i--) {
		if (must(inn.overs[i], "over").bowlerIds.includes(id)) streak++;
		else break;
	}
	if (streak >= rules.maxConsecutiveOvers) return no("BOWLED_PREVIOUS_OVER");
	// R-OV-06: whoever took part in a shared (mid-over change) previous over may not bowl next.
	const last = inn.overs[inn.overs.length - 1];
	if (last !== undefined && last.bowlerIds.length > 1 && last.bowlerIds.includes(id)) {
		return no("BOWLED_PREVIOUS_OVER");
	}
	return { playerId: id, eligible: true, reason: null };
}

export function eligibleBowlers(state: MatchState, inn: InningsState): BowlerEligibility[] {
	const midOver = inn.currentOver !== null && inn.currentOver.balls.length > 0;
	return Object.values(state.players)
		.filter((p) => p.teamId === inn.bowlingTeamId && p.role === "XI")
		.map((p) => bowlerEligibility(state, inn, p.id, midOver));
}
