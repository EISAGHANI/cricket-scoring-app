/**
 * Match configuration. Snapshotted into MATCH_STARTED so later preset changes never alter a
 * recorded match. Flat on purpose: every field is required, so a stored match is fully explicit.
 * See docs/CRICKET_RULES.md §2.
 */

export type TieBreaker =
	"NONE" | "SUPER_OVER" | "SUPER_OVER_REPEAT" | "SUPER_OVER_THEN_BOUNDARY_COUNT" | "BOWL_OUT";

export type TargetRevisionStrategyId = "ARR" | "MPO" | "DLS_STANDARD" | "MANUAL";

export interface Powerplay {
	name: string;
	/** 1-based, inclusive. */
	fromOver: number;
	toOver: number;
}

export interface MatchRules {
	/** Display label, e.g. "T20". Never used for logic. */
	format: string;
	playersPerSide: number;
	ballsPerOver: number;
	/** null = unlimited (multi-day). */
	oversPerInnings: number | null;
	inningsPerSide: 1 | 2;
	maxDays: number | null;
	bowlerMaxOvers: number | null;
	bowlerMaxBalls: number | null;
	/** How many overs in a row one bowler may bowl. 1 normally; 2 in The Hundred. */
	maxConsecutiveOvers: number;
	/** Bowling end changes after this many overs. 1 normally; 2 in The Hundred (10-ball ends). */
	oversPerEnd: number;
	wideRuns: number;
	noBallRuns: number;
	freeHit: "NONE" | "ALL_NO_BALLS";
	/** ⚠ R-EXT-08: how runs run off a no-ball that missed the bat are recorded. */
	noBallByesScoredAs: "BYES" | "NO_BALLS";
	lastManStands: boolean;
	allowHandledTheBall: boolean;
	boundaryFour: number;
	boundarySix: number;
	tieBreaker: TieBreaker;
	/** Legal balls in a super over. */
	superOverBalls: number;
	/** Wickets that end a super-over innings. */
	superOverWickets: number;
	followOnEnabled: boolean;
	/** null = derive from maxDays (R-MD-04). */
	followOnMargin: number | null;
	concussionReplacements: boolean;
	/** 0 = impact players disabled. */
	impactPlayersPerTeam: number;
	retiredHurtMayReturn: boolean;
	powerplays: Powerplay[];
	/** Overs the side batting second must have faced for a result (R-TR-08). null = not applicable. */
	minOversForResult: number | null;
	targetRevision: TargetRevisionStrategyId;
	/** G50 for the DLS Standard-style strategy (R-TR-05). */
	dlsG50: number | null;
}
