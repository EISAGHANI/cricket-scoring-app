/**
 * The engine's input language. Events are immutable and append-only; see docs/CRICKET_RULES.md §3
 * and ADR-0005. Shapes here are mirrored exactly by the Zod schemas in @cricket/schemas.
 *
 * Every payload field is required (nullable where optional) so stored events are fully explicit.
 */
import type { EventId, PlayerId, TeamId } from "./ids";
import type { MatchResult } from "./results";
import type { MatchRules } from "./rules";

export interface PlayerRef {
	id: PlayerId;
	name: string;
}

export interface TeamSheet {
	teamId: TeamId;
	name: string;
	shortName: string;
	playingXI: PlayerRef[];
	substitutes: PlayerRef[];
	captainId: PlayerId;
	wicketKeeperId: PlayerId;
}

export type End = "STRIKER" | "NON_STRIKER";

export type DeliveryExtra =
	| { kind: "WIDE" }
	| { kind: "NO_BALL"; runsFrom: "BAT" | "BYE" | "LEG_BYE" }
	| { kind: "BYE" }
	| { kind: "LEG_BYE" };

export type ExtraKind = DeliveryExtra["kind"];

/** Dismissals that happen on a delivery. */
export type DeliveryDismissalKind =
	| "BOWLED"
	| "CAUGHT"
	| "LBW"
	| "RUN_OUT"
	| "STUMPED"
	| "HIT_WICKET"
	| "OBSTRUCTING_THE_FIELD"
	| "HIT_BALL_TWICE"
	| "HANDLED_THE_BALL";

/** Dismissals recorded without a delivery (standalone WICKET event). */
export type StandaloneDismissalKind =
	"TIMED_OUT" | "RUN_OUT" | "OBSTRUCTING_THE_FIELD" | "HANDLED_THE_BALL";

export type DismissalKind = DeliveryDismissalKind | "TIMED_OUT" | "RETIRED_OUT";

export interface DeliveryDismissal {
	kind: DeliveryDismissalKind;
	batterId: PlayerId;
	/** Catcher, keeper, or fielders involved in a run out. */
	fielderIds: PlayerId[];
	/** Run out / obstructing: the end whose wicket was put down. null = the dismissed batter's end. */
	end: End | null;
	directHit: boolean;
}

export interface Point {
	/** Normalised 0..1 coordinates. */
	x: number;
	y: number;
}

export interface DeliveryDetail {
	wagon: Point | null;
	pitch: Point | null;
	shot: string | null;
	deliveryType: string | null;
}

export interface DeliveryPayload {
	/** Runs completed by the batters (for an overthrow boundary: completed + the run in progress if crossed). */
	runs: number;
	boundary: "FOUR" | "SIX" | null;
	/** Boundary from an overthrow: allowance is added to runs instead of replacing them (R-RUN-03). */
	overthrow: boolean;
	extra: DeliveryExtra | null;
	dismissal: DeliveryDismissal | null;
	/** Penalty runs to the batting side awarded on this delivery (R-EXT-10). */
	penaltyRuns: number;
	/** The umpire allowed an extra ball after the over was due (R-OV-01). */
	overMiscount: boolean;
	detail: DeliveryDetail | null;
}

interface Ev<T extends string, P> {
	id: EventId;
	/** Per-match, strictly increasing (gapless in the stored log). */
	seq: number;
	type: T;
	payload: P;
}

export type MatchStartedEvent = Ev<
	"MATCH_STARTED",
	{ rules: MatchRules; teams: [TeamSheet, TeamSheet] }
>;
export type TossEvent = Ev<"TOSS", { winnerTeamId: TeamId; decision: "BAT" | "BOWL" }>;
export type InningsStartedEvent = Ev<
	"INNINGS_STARTED",
	{ battingTeamId: TeamId; strikerId: PlayerId; nonStrikerId: PlayerId; bowlerId: PlayerId }
>;
export type DeliveryEvent = Ev<"DELIVERY", DeliveryPayload>;
export type WicketEvent = Ev<
	"WICKET",
	{ kind: StandaloneDismissalKind; batterId: PlayerId; fielderIds: PlayerId[] }
>;
export type BatterInEvent = Ev<"BATTER_IN", { batterId: PlayerId }>;
export type BowlerChangeEvent = Ev<
	"BOWLER_CHANGE",
	{ bowlerId: PlayerId; reason: "NEW_OVER" | "INJURY" | "SUSPENDED" | "OTHER" }
>;
export type EndOfOverEvent = Ev<"END_OF_OVER", { reason: "NORMAL" | "MISCOUNT" }>;
export type PenaltyRunsEvent = Ev<
	"PENALTY_RUNS",
	{ toTeamId: TeamId; runs: number; reason: string }
>;
export type RetirementEvent = Ev<"RETIREMENT", { batterId: PlayerId; kind: "HURT" | "OUT" }>;
export type SubstitutionEvent = Ev<
	"SUBSTITUTION",
	{
		kind: "CONCUSSION" | "IMPACT" | "FIELDING";
		teamId: TeamId;
		outPlayerId: PlayerId;
		inPlayerId: PlayerId;
	}
>;
export type SwapStrikeEvent = Ev<"SWAP_STRIKE", { reason: string }>;
export type DeclarationEvent = Ev<"DECLARATION", { teamId: TeamId }>;
export type FollowOnEvent = Ev<"FOLLOW_ON", { enforced: boolean }>;
export type InterruptionEvent = Ev<
	"INTERRUPTION",
	{ kind: "RAIN" | "BAD_LIGHT" | "LUNCH" | "TEA" | "STUMPS" | "OTHER" }
>;
export type PlayResumedEvent = Ev<
	"PLAY_RESUMED",
	{ revisedOvers: number | null; revisedBowlerMaxOvers: number | null }
>;
export type TargetRevisedEvent = Ev<
	"TARGET_REVISED",
	{ target: number; overs: number; override: boolean }
>;
export type InningsEndedEvent = Ev<"INNINGS_ENDED", { reason: "ALL_OUT" | "FORFEITED" }>;
export type SuperOverStartedEvent = Ev<"SUPER_OVER_STARTED", { round: number }>;
export type BowlOutResultEvent = Ev<"BOWL_OUT_RESULT", { winnerTeamId: TeamId }>;
export type MatchResultEvent = Ev<"MATCH_RESULT", { result: MatchResult; override: boolean }>;
export type UndoEvent = Ev<"UNDO", { targetId: EventId }>;
export type CorrectionEvent = Ev<
	"CORRECTION",
	{ targetId: EventId; patch: { [key: string]: unknown } }
>;

/** Events the reducer applies directly. */
export type PlayEvent =
	| MatchStartedEvent
	| TossEvent
	| InningsStartedEvent
	| DeliveryEvent
	| WicketEvent
	| BatterInEvent
	| BowlerChangeEvent
	| EndOfOverEvent
	| PenaltyRunsEvent
	| RetirementEvent
	| SubstitutionEvent
	| SwapStrikeEvent
	| DeclarationEvent
	| FollowOnEvent
	| InterruptionEvent
	| PlayResumedEvent
	| TargetRevisedEvent
	| InningsEndedEvent
	| SuperOverStartedEvent
	| BowlOutResultEvent
	| MatchResultEvent;

/** Events that rewrite the log rather than the state (resolved before reducing). */
export type LogEvent = UndoEvent | CorrectionEvent;

export type MatchEvent = PlayEvent | LogEvent;
export type MatchEventType = MatchEvent["type"];
export type PlayEventType = PlayEvent["type"];
