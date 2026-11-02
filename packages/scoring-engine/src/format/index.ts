/** Human-readable text: dismissals, results, scorecards and auto-commentary. */
import { must } from "../internal/must";
import { currentBowlerId, inningsOversText } from "../reducer/context";
import { economy, strikeRate } from "../metrics";
import type { DeliveryEvent } from "../types/events";
import type { PlayerId, TeamId } from "../types/ids";
import type { MatchResult, WinMethod } from "../types/results";
import type { BatterLine, DismissalRecord, InningsState, MatchState } from "../types/state";

export function playerName(state: MatchState, id: PlayerId | null): string {
	if (id === null) return "";
	return state.players[id]?.name ?? id;
}

export function teamName(state: MatchState, id: TeamId): string {
	return state.teams?.find((t) => t.teamId === id)?.name ?? id;
}

/** "Ball" overs text for The Hundred, "O.B" otherwise (R-OV-07, R-OV-08). */
export function formatOvers(state: MatchState, inn: InningsState): string {
	if (state.rules?.format === "HUNDRED") return `${inn.legalBalls} balls`;
	return inningsOversText(inn);
}

export function bowlerOversText(legalBalls: number, ballsPerOver: number): string {
	return `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`.replace(
		/\.0$/,
		"",
	);
}

/** Scorecard dismissal text, e.g. "c Smith b Jones", "run out (Smith/†Buttler)" (R-DIS-03). */
export function dismissalText(state: MatchState, inn: InningsState, line: BatterLine): string {
	if (line.status === "BATTING" || line.status === "NOT_OUT") return "not out";
	if (line.status === "RETIRED_HURT")
		return inn.status === "COMPLETE" ? "retired not out" : "retired hurt";
	const d = must(line.dismissal, "dismissal");
	return describeDismissal(state, inn, d);
}

function fielder(state: MatchState, inn: InningsState, id: PlayerId): string {
	const p = state.players[id];
	const keeper = state.keepers[inn.bowlingTeamId] === id;
	const name = playerName(state, id);
	if (p?.role === "SUBSTITUTE") return `sub (${name})`;
	return keeper ? `†${name}` : name;
}

export function describeDismissal(
	state: MatchState,
	inn: InningsState,
	d: DismissalRecord,
): string {
	const b = playerName(state, d.bowlerId);
	const f = d.fielderIds.map((id) => fielder(state, inn, id));
	switch (d.kind) {
		case "BOWLED":
			return `b ${b}`;
		case "CAUGHT":
			return d.fielderIds[0] === d.bowlerId ? `c & b ${b}` : `c ${must(f[0], "catcher")} b ${b}`;
		case "LBW":
			return `lbw b ${b}`;
		case "STUMPED":
			return `st ${must(f[0], "keeper")} b ${b}`;
		case "HIT_WICKET":
			return `hit wicket b ${b}`;
		case "RUN_OUT":
			return f.length === 0 ? "run out" : `run out (${f.join("/")})`;
		case "OBSTRUCTING_THE_FIELD":
			return "obstructing the field";
		case "HIT_BALL_TWICE":
			return "hit the ball twice";
		case "HANDLED_THE_BALL":
			return "handled the ball";
		case "TIMED_OUT":
			return "timed out";
		case "RETIRED_OUT":
			return "retired out";
	}
}

export function resultText(state: MatchState, result: MatchResult): string {
	switch (result.kind) {
		case "TIE":
			return "Match tied";
		case "DRAW":
			return "Match drawn";
		case "NO_RESULT":
			return "No result";
		case "ABANDONED":
			return "Match abandoned";
		case "WIN": {
			const team = teamName(state, result.winnerTeamId);
			const method =
				result.method === "TARGET_REVISION"
					? ` (${must(state.rules, "rules").targetRevision} method)`
					: "";
			const m = result.margin;
			switch (m.type) {
				case "RUNS":
					return `${team} won by ${m.runs} run${m.runs === 1 ? "" : "s"}${method}`;
				case "INNINGS":
					return `${team} won by an innings and ${m.runs} run${m.runs === 1 ? "" : "s"}`;
				case "WICKETS": {
					const balls =
						m.ballsRemaining === null
							? ""
							: ` (${m.ballsRemaining} ball${m.ballsRemaining === 1 ? "" : "s"} left)`;
					return `${team} won by ${m.wickets} wicket${m.wickets === 1 ? "" : "s"}${balls}${method}`;
				}
				case "NONE": {
					const how: Record<WinMethod, string> = {
						SUPER_OVER: "the super over",
						BOUNDARY_COUNT: "boundary count",
						BOWL_OUT: "the bowl-out",
						AWARDED: "award",
						FORFEIT: "forfeit",
						CONCEDED: "concession",
						NORMAL: "decision",
						TARGET_REVISION: "decision",
					};
					return `${team} won (${how[result.method]})`;
				}
			}
		}
	}
}

const pad = (s: string, n: number): string => s.padEnd(n);
const lpad = (s: string, n: number): string => s.padStart(n);
const fixed = (n: number | null): string => (n === null ? "-" : n.toFixed(2));

/** Plain-text scorecard for the CLI and tests. */
export function formatScorecard(state: MatchState): string {
	const out: string[] = [];
	for (const inn of state.innings) {
		const label =
			inn.kind === "SUPER_OVER"
				? `Super over ${must(inn.superOverRound, "round")}`
				: `${teamName(state, inn.battingTeamId)} innings${inn.followOn ? " (following on)" : ""}`;
		const title =
			inn.kind === "SUPER_OVER" ? `${label}: ${teamName(state, inn.battingTeamId)}` : label;
		out.push(
			`${title}  ${inn.runs}/${inn.wickets} (${formatOvers(state, inn)} ov)${inn.closeReason === "DECLARED" ? " dec" : ""}${inn.closeReason === "FORFEITED" ? " forfeited" : ""}`,
		);
		out.push(
			`  ${pad("Batter", 24)} ${pad("", 36)} ${lpad("R", 4)} ${lpad("B", 4)} ${lpad("4s", 3)} ${lpad("6s", 3)} ${lpad("SR", 7)}`,
		);
		for (const b of inn.batters) {
			out.push(
				`  ${pad(playerName(state, b.playerId), 24)} ${pad(dismissalText(state, inn, b), 36)} ${lpad(String(b.runs), 4)} ${lpad(String(b.balls), 4)} ${lpad(String(b.fours), 3)} ${lpad(String(b.sixes), 3)} ${lpad(fixed(strikeRate(b.runs, b.balls)), 7)}`,
			);
		}
		const e = inn.extras;
		const extras = e.wides + e.noBalls + e.byes + e.legByes + e.penalties;
		out.push(
			`  Extras ${extras} (b ${e.byes}, lb ${e.legByes}, w ${e.wides}, nb ${e.noBalls}, p ${e.penalties})`,
		);
		if (inn.fallOfWickets.length > 0) {
			out.push(
				`  FoW: ${inn.fallOfWickets.map((f) => `${f.runs}-${f.wicketNo} (${playerName(state, f.batterId)}, ${f.overs})`).join(", ")}`,
			);
		}
		out.push(
			`  ${pad("Bowler", 24)} ${lpad("O", 5)} ${lpad("M", 3)} ${lpad("R", 4)} ${lpad("W", 3)} ${lpad("Econ", 6)} ${lpad("wd", 3)} ${lpad("nb", 3)}`,
		);
		for (const b of inn.bowlers) {
			out.push(
				`  ${pad(playerName(state, b.playerId), 24)} ${lpad(bowlerOversText(b.legalBalls, inn.ballsPerOver), 5)} ${lpad(String(b.maidens), 3)} ${lpad(String(b.runs), 4)} ${lpad(String(b.wickets), 3)} ${lpad(fixed(economy(b.runs, b.legalBalls, inn.ballsPerOver)), 6)} ${lpad(String(b.wides), 3)} ${lpad(String(b.noBalls), 3)}`,
			);
		}
		out.push("");
	}
	const result = state.result ?? state.provisionalResult;
	if (result !== null)
		out.push(
			`Result: ${resultText(state, result)}${state.result === null ? " (awaiting confirmation)" : ""}`,
		);
	return out.join("\n");
}

/** One-line auto-commentary for a delivery, from the state before it (Phase 5 feed). */
export function deliveryCommentary(before: MatchState, event: DeliveryEvent): string {
	const inn = before.innings[before.innings.length - 1];
	if (inn === undefined || inn.currentOver === null) return "";
	const over = `${inn.completedOvers}.${inn.currentOver.legalBalls + 1}`;
	const bowler = playerName(before, currentBowlerId(inn));
	const batter = playerName(before, inn.strikerId);
	const p = event.payload;
	let what: string;
	if (p.dismissal !== null) what = "OUT!";
	else if (p.boundary === "SIX" && p.extra === null) what = "SIX!";
	else if (p.boundary === "FOUR" && p.extra === null && !p.overthrow) what = "FOUR!";
	else if (p.extra?.kind === "WIDE") what = "wide";
	else if (p.extra?.kind === "NO_BALL") what = "no ball";
	else if (p.extra?.kind === "BYE") what = `${p.runs} bye${p.runs === 1 ? "" : "s"}`;
	else if (p.extra?.kind === "LEG_BYE") what = `${p.runs} leg bye${p.runs === 1 ? "" : "s"}`;
	else if (p.runs === 0) what = "no run";
	else what = `${p.runs} run${p.runs === 1 ? "" : "s"}`;
	return `${over} ${bowler} to ${batter}, ${what}`;
}
