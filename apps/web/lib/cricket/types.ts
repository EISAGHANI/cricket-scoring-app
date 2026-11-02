/**
 * Domain model. A match stores only what the scorer entered (an ordered list
 * of events); every total, figure and scorecard is derived from it by
 * `computeMatchState`. That makes undo exact and keeps stored data tiny.
 */

export type Id = string;

export interface Player {
	id: Id;
	name: string;
}

/** A saved team (the port of the original Java `Team` entity, plus a squad). */
export interface Team {
	id: Id;
	name: string;
	/** Up to 4 letters, shown on compact scoreboards. */
	shortName: string;
	location?: string;
	/** Accent colour (hex) used for the team badge. */
	color: string;
	players: Player[];
	createdAt: number;
	updatedAt: number;
}

/** The team as it took the field: a snapshot, so later squad edits don't rewrite history. */
export interface MatchTeam {
	teamId: Id;
	name: string;
	shortName: string;
	color: string;
	players: Player[];
}

export type TeamIndex = 0 | 1;

export type ExtraKind = "wide" | "noBall" | "bye" | "legBye";

export type DismissalKind = "bowled" | "caught" | "lbw" | "runOut" | "stumped" | "hitWicket";

export interface Wicket {
	kind: DismissalKind;
	playerOutId: Id;
	/** Catcher, run-out fielder or wicket-keeper. */
	fielderId?: Id;
}

/**
 * One delivery.
 * - no extra:   `runs` off the bat.
 * - wide:       1 penalty + `extraRuns` run/boundary; all count as wides.
 * - noBall:     1 penalty + `runs` off the bat (credited to the batter).
 * - bye/legBye: `extraRuns` run; the batter is not credited.
 */
export interface BallEvent {
	type: "ball";
	runs: number;
	extra?: ExtraKind;
	extraRuns?: number;
	wicket?: Wicket;
}

export type MatchEvent =
	| { type: "startInnings"; strikerId: Id; nonStrikerId: Id; bowlerId: Id }
	| BallEvent
	| { type: "newBatter"; playerId: Id }
	| { type: "newBowler"; playerId: Id }
	| { type: "swapStrike" }
	| { type: "endInnings" };

export interface Match {
	id: Id;
	createdAt: number;
	updatedAt: number;
	venue?: string;
	teams: [MatchTeam, MatchTeam];
	oversPerInnings: number;
	toss: { winner: TeamIndex; decision: "bat" | "bowl" };
	battingFirst: TeamIndex;
	events: MatchEvent[];
}
