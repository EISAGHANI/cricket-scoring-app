/**
 * MatchState is plain JSON (no classes, Maps or Dates) so it can be cloned, stored as a JSONB
 * snapshot and sent over the wire. Everything here is derived from the event log.
 */
import type { DismissalKind, TeamSheet } from "./events";
import type { PlayerId, TeamId } from "./ids";
import type { MatchResult } from "./results";
import type { MatchRules } from "./rules";

export interface DismissalRecord {
	kind: DismissalKind;
	/** Bowler credited with the wicket, or null (run out, timed out, retired out, …). */
	bowlerId: PlayerId | null;
	/** Bowler at the time (for scorecards), even when not credited. */
	bowlerAtTimeId: PlayerId | null;
	fielderIds: PlayerId[];
}

export type BatterStatus = "BATTING" | "NOT_OUT" | "OUT" | "RETIRED_HURT";

export interface BatterLine {
	playerId: PlayerId;
	/** 1-based order of appearance. */
	position: number;
	runs: number;
	/** Balls faced: legal balls and no-balls, not wides. */
	balls: number;
	fours: number;
	sixes: number;
	/** Legal balls faced with no runs off the bat. */
	dots: number;
	status: BatterStatus;
	dismissal: DismissalRecord | null;
}

export interface BowlerLine {
	playerId: PlayerId;
	legalBalls: number;
	maidens: number;
	/** Runs charged to the bowler. */
	runs: number;
	wickets: number;
	wides: number;
	noBalls: number;
	/** Legal balls with no runs charged to the bowler. */
	dots: number;
	foursConceded: number;
	sixesConceded: number;
	/** Overs this bowler started (quota counting, R-OV-05). */
	oversStarted: number;
}

export interface BallSummary {
	seq: number;
	/** Display label: "•", "1", "4", "6", "W", "1wd", "2nb", "1b", "1lb", "5p", … */
	label: string;
	/** Team runs from this delivery, including extras and penalty runs. */
	runs: number;
	legal: boolean;
	wicket: boolean;
	bowlerId: PlayerId;
	batterId: PlayerId;
}

export interface OverRecord {
	/** 0-based over index within the innings. */
	index: number;
	bowlerIds: PlayerId[];
	legalBalls: number;
	/** Team runs in the over (incl. extras). */
	runs: number;
	/** Runs charged to bowlers in the over (maiden check). */
	bowlerRuns: number;
	wickets: number;
	balls: BallSummary[];
	/** Ended by END_OF_OVER { reason: MISCOUNT } or with extra balls allowed. */
	miscount: boolean;
}

export interface FallOfWicket {
	wicketNo: number;
	runs: number;
	legalBalls: number;
	/** Completed overs + balls in the current over at the time, e.g. "12.3". */
	overs: string;
	batterId: PlayerId;
}

export interface Partnership {
	/** The wicket this partnership is for (1 = first wicket). */
	wicketNo: number;
	batterIds: [PlayerId, PlayerId | null];
	runs: number;
	legalBalls: number;
	contributions: Record<PlayerId, { runs: number; balls: number }>;
	/** How it ended: null while unbroken. */
	endedBy: "WICKET" | "RETIREMENT" | "INNINGS_END" | null;
}

export interface Extras {
	wides: number;
	noBalls: number;
	byes: number;
	legByes: number;
	penalties: number;
}

export type InningsCloseReason =
	"ALL_OUT" | "OVERS" | "TARGET" | "DECLARED" | "FORFEITED" | "MATCH_ENDED";

export interface OversReduction {
	legalBalls: number;
	wickets: number;
	oversBefore: number;
	oversAfter: number;
}

export interface InningsState {
	/** 0-based index into MatchState.innings. */
	index: number;
	kind: "REGULAR" | "SUPER_OVER";
	superOverRound: number | null;
	battingTeamId: TeamId;
	bowlingTeamId: TeamId;
	runs: number;
	wickets: number;
	legalBalls: number;
	completedOvers: number;
	extras: Extras;
	batters: BatterLine[];
	bowlers: BowlerLine[];
	strikerId: PlayerId | null;
	nonStrikerId: PlayerId | null;
	/** Last Man Stands: one batter left, batting alone (R-LMS-01). */
	soloBatting: boolean;
	currentOver: OverRecord | null;
	overs: OverRecord[];
	fallOfWickets: FallOfWicket[];
	partnerships: Partnership[];
	/** Runs (penalties) waiting for the next partnership to start. */
	pendingPartnershipRuns: number;
	/** Penalty runs added while this innings was not in play (R-EXT-09). */
	penaltyRunsOutsidePlay: number;
	freeHit: boolean;
	status: "IN_PROGRESS" | "COMPLETE";
	closeReason: InningsCloseReason | null;
	maxOvers: number | null;
	/** Overs available when the innings started (DLS R1/R2 baseline). */
	initialMaxOvers: number | null;
	ballsPerOver: number;
	maxWickets: number;
	target: number | null;
	targetRevised: boolean;
	followOn: boolean;
	/** Boundaries (any 4 or 6 allowance) — used by the boundary-count tie-breaker. */
	boundaries: number;
	suspendedBowlerIds: PlayerId[];
	reductions: OversReduction[];
}

export type PlayerRole = "XI" | "SUBSTITUTE" | "REPLACED";

export interface PlayerState {
	id: PlayerId;
	name: string;
	teamId: TeamId;
	role: PlayerRole;
	/** Concussion replacement chain: the player this one replaced. */
	replacesId: PlayerId | null;
	replacedById: PlayerId | null;
	substitutionKind: "CONCUSSION" | "IMPACT" | null;
}

export interface InterruptionRecord {
	kind: "RAIN" | "BAD_LIGHT" | "LUNCH" | "TEA" | "STUMPS" | "OTHER";
	inningsIndex: number | null;
	legalBalls: number;
	wickets: number;
	revisedOvers: number | null;
	resumed: boolean;
}

export type MatchStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export interface MatchState {
	status: MatchStatus;
	lastSeq: number;
	rules: MatchRules | null;
	teams: [TeamSheet, TeamSheet] | null;
	players: Record<PlayerId, PlayerState>;
	keepers: Record<TeamId, PlayerId>;
	toss: { winnerTeamId: TeamId; decision: "BAT" | "BOWL" } | null;
	innings: InningsState[];
	followOn: { available: boolean; enforced: boolean | null };
	superOverRound: number;
	bowlOutWinnerId: TeamId | null;
	interruptions: InterruptionRecord[];
	interrupted: boolean;
	day: number;
	/** Overs limit for the next innings set while play was interrupted between innings. */
	nextInningsMaxOvers: number | null;
	/** TARGET_REVISED recorded before the chasing innings started. */
	pendingTarget: { target: number; overs: number } | null;
	bowlerMaxOversOverride: number | null;
	/** Penalty runs to a side that has not batted yet (R-EXT-09). */
	pendingPenaltyRuns: Record<TeamId, number>;
	impactSubstitutionsUsed: Record<TeamId, number>;
	/** Result computable from play so far; confirmed by MATCH_RESULT. */
	provisionalResult: MatchResult | null;
	result: MatchResult | null;
}
