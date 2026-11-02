/** END_OF_OVER and BOWLER_CHANGE (CRICKET_RULES.md §7). */
import { violation } from "../errors";
import { must } from "../internal/must";
import type { BowlerChangeEvent, EndOfOverEvent } from "../types/events";
import type { InningsState, MatchState } from "../types/state";
import {
	bowlerEligibility,
	bowlerLine,
	needsBowler,
	requireInnings,
	requireRules,
	unstartOver,
} from "./context";
import { checkInningsEnd, completeOver } from "./innings";

export function startOver(inn: InningsState, bowlerId: string): void {
	inn.currentOver = {
		index: inn.overs.length,
		bowlerIds: [bowlerId],
		legalBalls: 0,
		runs: 0,
		bowlerRuns: 0,
		wickets: 0,
		balls: [],
		miscount: false,
	};
	bowlerLine(inn, bowlerId).oversStarted++;
}

export function applyEndOfOver(state: MatchState, event: EndOfOverEvent): void {
	const inn = requireInnings(state);
	const rules = requireRules(state);
	const over = inn.currentOver;
	if (over === null) violation("NO_OVER_IN_PROGRESS", "R-OV-02", "No over is in progress");
	if (over.legalBalls < inn.ballsPerOver) {
		// R-OV-02: an early end is an umpire's miscount and must say so.
		if (event.payload.reason !== "MISCOUNT") {
			violation(
				"OVER_NOT_COMPLETE",
				"R-OV-02",
				`Only ${over.legalBalls} legal balls have been bowled`,
			);
		}
		over.miscount = true;
	}
	completeOver(inn);
	// R-OV-03 / R-OV-08: batters change ends when the bowling end changes.
	if (inn.completedOvers % rules.oversPerEnd === 0 && !inn.soloBatting) {
		[inn.strikerId, inn.nonStrikerId] = [inn.nonStrikerId, inn.strikerId];
	}
	checkInningsEnd(state, inn);
}

export function applyBowlerChange(state: MatchState, event: BowlerChangeEvent): void {
	const inn = requireInnings(state);
	const { bowlerId, reason } = event.payload;

	if (needsBowler(inn)) {
		if (reason !== "NEW_OVER") {
			violation("INVALID_REASON", "R-OV-05", "A bowler for a new over uses reason NEW_OVER");
		}
		const check = bowlerEligibility(state, inn, bowlerId, false);
		if (!check.eligible)
			violation(`BOWLER_${check.reason}`, "R-OV-05", `${bowlerId} cannot bowl: ${check.reason}`);
		startOver(inn, bowlerId);
		return;
	}

	const over = must(inn.currentOver, "current over");
	if (over.legalBalls >= inn.ballsPerOver) {
		violation("OVER_COMPLETE", "R-OV-01", "The over is complete; record END_OF_OVER first");
	}
	if (reason === "NEW_OVER")
		violation("OVER_IN_PROGRESS", "R-OV-06", "An over is already in progress");

	if (over.balls.length === 0) {
		// Correcting the selection before a ball is bowled.
		unstartOver(inn);
		const check = bowlerEligibility(state, inn, bowlerId, false);
		if (!check.eligible)
			violation(`BOWLER_${check.reason}`, "R-OV-05", `${bowlerId} cannot bowl: ${check.reason}`);
		startOver(inn, bowlerId);
		return;
	}

	// R-OV-06: mid-over change (injury / suspension); someone else completes the over.
	const outgoing = must(over.bowlerIds[over.bowlerIds.length - 1], "bowler");
	const check = bowlerEligibility(state, inn, bowlerId, true);
	if (!check.eligible)
		violation(
			`BOWLER_${check.reason}`,
			"R-OV-06",
			`${bowlerId} cannot complete the over: ${check.reason}`,
		);
	if (reason === "SUSPENDED") inn.suspendedBowlerIds.push(outgoing);
	over.bowlerIds.push(bowlerId);
	bowlerLine(inn, bowlerId);
}
