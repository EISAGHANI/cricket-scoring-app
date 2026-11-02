/** Dismissals, batters coming in, retirements and partnerships (CRICKET_RULES.md §8, §12). */
import { violation } from "../errors";
import { must } from "../internal/must";
import { creditsBowler } from "../rules/dismissals";
import type { BatterInEvent, DismissalKind, RetirementEvent, WicketEvent } from "../types/events";
import type { PlayerId } from "../types/ids";
import type { BatterLine, InningsState, MatchState } from "../types/state";
import {
	atCrease,
	batterLine,
	canField,
	currentBowlerId,
	eligibleBatters,
	inningsOversText,
	needsBatter,
	requireInnings,
	requireNotInterrupted,
	requireRules,
} from "./context";
import { checkInningsEnd, closeInnings } from "./innings";

export function newBatterLine(inn: InningsState, id: PlayerId): BatterLine {
	const line: BatterLine = {
		playerId: id,
		position: inn.batters.length + 1,
		runs: 0,
		balls: 0,
		fours: 0,
		sixes: 0,
		dots: 0,
		status: "BATTING",
		dismissal: null,
	};
	inn.batters.push(line);
	return line;
}

export function startPartnership(inn: InningsState, a: PlayerId, b: PlayerId | null): void {
	const contributions: Record<PlayerId, { runs: number; balls: number }> = {
		[a]: { runs: 0, balls: 0 },
	};
	if (b !== null) contributions[b] = { runs: 0, balls: 0 };
	inn.partnerships.push({
		wicketNo: inn.wickets + 1,
		batterIds: [a, b],
		runs: inn.pendingPartnershipRuns,
		legalBalls: 0,
		contributions,
		endedBy: null,
	});
	inn.pendingPartnershipRuns = 0;
}

export function openPartnership(inn: InningsState) {
	const last = inn.partnerships[inn.partnerships.length - 1];
	return last !== undefined && last.endedBy === null ? last : null;
}

function endPartnership(inn: InningsState, endedBy: "WICKET" | "RETIREMENT"): void {
	const open = openPartnership(inn);
	if (open !== null) open.endedBy = endedBy;
}

/** Vacate the batter's crease position. */
function vacate(inn: InningsState, id: PlayerId): void {
	if (inn.strikerId === id) inn.strikerId = null;
	else inn.nonStrikerId = null;
}

/**
 * Record a dismissal: line status, bowler credit (R-DIS-02), FoW (R-DIS-11), partnership end.
 * Crease positions are handled by the caller.
 */
export function recordDismissal(
	inn: InningsState,
	batterId: PlayerId,
	kind: DismissalKind,
	fielderIds: PlayerId[],
): void {
	const line = batterLine(inn, batterId) ?? newBatterLine(inn, batterId);
	const bowlerAtTimeId = currentBowlerId(inn);
	const credited = creditsBowler(kind) ? bowlerAtTimeId : null;
	line.status = "OUT";
	line.dismissal = { kind, bowlerId: credited, bowlerAtTimeId, fielderIds };
	if (credited !== null)
		must(
			inn.bowlers.find((b) => b.playerId === credited),
			"bowler line",
		).wickets++;
	inn.wickets++;
	inn.fallOfWickets.push({
		wicketNo: inn.wickets,
		runs: inn.runs,
		legalBalls: inn.legalBalls,
		overs: inningsOversText(inn),
		batterId,
	});
	if (inn.currentOver !== null) inn.currentOver.wickets++;
	endPartnership(inn, "WICKET");
}

/**
 * After a wicket in Last Man Stands, the survivor bats alone once nobody else can come in
 * (R-LMS-01).
 */
export function maybeGoSolo(state: MatchState, inn: InningsState): void {
	const rules = requireRules(state);
	if (!rules.lastManStands || inn.status !== "IN_PROGRESS") return;
	if (inn.wickets !== rules.playersPerSide - 1) return;
	const survivor = inn.strikerId ?? inn.nonStrikerId;
	if (survivor === null) return;
	inn.strikerId = survivor;
	inn.nonStrikerId = null;
	inn.soloBatting = true;
	startPartnership(inn, survivor, null);
}

export function validateFielders(
	state: MatchState,
	inn: InningsState,
	ids: PlayerId[],
	rule: string,
): void {
	for (const id of ids) {
		if (!canField(state, id, inn.bowlingTeamId)) {
			violation("INVALID_FIELDER", rule, `${id} is not on the fielding side`);
		}
	}
}

export function applyBatterIn(state: MatchState, event: BatterInEvent): void {
	const inn = requireInnings(state);
	const { batterId } = event.payload;
	if (!needsBatter(inn)) violation("NO_VACANCY", "R-DIS-09", "No batter is needed now");
	if (!eligibleBatters(state, inn).includes(batterId)) {
		violation("BATTER_NOT_ELIGIBLE", "R-DIS-09", `${batterId} cannot come in to bat`);
	}
	const line = batterLine(inn, batterId);
	if (line === null) newBatterLine(inn, batterId);
	else line.status = "BATTING"; // retired hurt, resuming (R-SUB-04)
	const survivor = inn.strikerId ?? inn.nonStrikerId;
	if (inn.strikerId === null) inn.strikerId = batterId;
	else inn.nonStrikerId = batterId;
	if (survivor !== null) startPartnership(inn, survivor, batterId);
}

export function applyWicket(state: MatchState, event: WicketEvent): void {
	const inn = requireInnings(state);
	requireNotInterrupted(state);
	const rules = requireRules(state);
	const { kind, batterId, fielderIds } = event.payload;
	validateFielders(state, inn, fielderIds, "R-DIS-08");
	if (kind === "TIMED_OUT") {
		// R-DIS-10: the incoming batter is out without facing.
		if (!needsBatter(inn))
			violation("NO_VACANCY", "R-DIS-10", "Timed out applies to an incoming batter");
		if (!eligibleBatters(state, inn).includes(batterId) || batterLine(inn, batterId) !== null) {
			violation("BATTER_NOT_ELIGIBLE", "R-DIS-10", `${batterId} is not the incoming batter`);
		}
		recordDismissal(inn, batterId, kind, fielderIds);
		checkInningsEnd(state, inn);
		return;
	}
	if (kind === "HANDLED_THE_BALL" && !rules.allowHandledTheBall) {
		violation("DISMISSAL_NOT_ALLOWED", "R-DIS-01", "Handled the ball is not a mode of dismissal");
	}
	// R-DIS-08: run out (e.g. non-striker backing up) or obstruction without a delivery.
	if (!atCrease(inn, batterId))
		violation("BATTER_NOT_AT_CREASE", "R-DIS-08", `${batterId} is not batting`);
	recordDismissal(inn, batterId, kind, fielderIds);
	vacate(inn, batterId);
	maybeGoSolo(state, inn);
	checkInningsEnd(state, inn);
}

export function applyRetirement(state: MatchState, event: RetirementEvent): void {
	const inn = requireInnings(state);
	const { batterId, kind } = event.payload;
	if (!atCrease(inn, batterId))
		violation("BATTER_NOT_AT_CREASE", "R-SUB-04", `${batterId} is not batting`);
	if (kind === "OUT") {
		recordDismissal(inn, batterId, "RETIRED_OUT", []); // R-SUB-05
	} else {
		must(batterLine(inn, batterId), "batter line").status = "RETIRED_HURT"; // R-SUB-04
		endPartnership(inn, "RETIREMENT");
	}
	vacate(inn, batterId);
	maybeGoSolo(state, inn);
	checkInningsEnd(state, inn);
}

/** INNINGS_ENDED { ALL_OUT }: no batter is available to come in (e.g. absent hurt). */
export function endInningsNoBatters(state: MatchState): void {
	const inn = requireInnings(state);
	if (!needsBatter(inn)) {
		violation(
			"BATTERS_AVAILABLE",
			"R-INN-02",
			"The innings can only be closed this way when a batter is needed",
		);
	}
	closeInnings(state, inn, "ALL_OUT");
}
