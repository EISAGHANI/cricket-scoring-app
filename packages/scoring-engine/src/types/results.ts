import type { TeamId } from "./ids";

export type WinMargin =
	| { type: "RUNS"; runs: number }
	| { type: "WICKETS"; wickets: number; ballsRemaining: number | null }
	| { type: "INNINGS"; runs: number }
	| { type: "NONE" };

export type WinMethod =
	| "NORMAL"
	| "TARGET_REVISION"
	| "SUPER_OVER"
	| "BOUNDARY_COUNT"
	| "BOWL_OUT"
	| "AWARDED"
	| "FORFEIT"
	| "CONCEDED";

export type MatchResult =
	| { kind: "WIN"; winnerTeamId: TeamId; margin: WinMargin; method: WinMethod }
	| { kind: "TIE" }
	| { kind: "DRAW" }
	| { kind: "NO_RESULT" }
	| { kind: "ABANDONED" };
