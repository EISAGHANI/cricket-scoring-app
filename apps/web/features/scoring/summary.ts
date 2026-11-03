/** Pure: the short match summary that lists and cards show without replaying the log. */
import type { MatchSummary } from "@cricket/db/schema";
import { ballsUsed, currentInnings, format, type MatchState } from "@cricket/scoring-engine";

export function summarize(state: MatchState): MatchSummary {
	return {
		innings: state.innings.map((inn) => ({
			teamId: inn.battingTeamId,
			runs: inn.runs,
			wickets: inn.wickets,
			overs: format.formatOvers(state, inn),
			superOver: inn.kind === "SUPER_OVER",
		})),
		status: statusText(state),
	};
}

/** One line: the result, the chase equation, or what happens next. */
export function statusText(state: MatchState): string | null {
	if (state.result !== null) return format.resultText(state, state.result);
	if (state.status === "NOT_STARTED") return null;
	if (state.interrupted) return "Play interrupted";
	if (state.toss === null) return "Waiting for the toss";
	const inn = currentInnings(state);
	if (inn === null) {
		if (state.provisionalResult !== null) return format.resultText(state, state.provisionalResult);
		if (state.innings.length === 0) {
			const team = format.teamName(state, state.toss.winnerTeamId);
			return `${team} won the toss and chose to ${state.toss.decision === "BAT" ? "bat" : "bowl"}`;
		}
		return "Innings break";
	}
	if (inn.target !== null) {
		const need = inn.target - inn.runs;
		const team = format.teamName(state, inn.battingTeamId);
		if (inn.maxOvers === null) return `${team} need ${need} run${need === 1 ? "" : "s"} to win`;
		const left = inn.maxOvers * inn.ballsPerOver - ballsUsed(inn);
		return `${team} need ${need} from ${left} ball${left === 1 ? "" : "s"}`;
	}
	return null;
}
