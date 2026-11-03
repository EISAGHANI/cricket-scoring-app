/**
 * Auto-commentary from the event log (pure). Only the latest `limit` effective events are
 * narrated: everything before them is replayed once, so long matches stay cheap.
 */
import {
	applyEvent,
	format,
	replay,
	resolveLog,
	type MatchEvent,
	type MatchState,
	type PlayEvent,
} from "@cricket/scoring-engine";

export interface CommentaryLine {
	seq: number;
	kind: "ball" | "wicket" | "four" | "six" | "over" | "info";
	text: string;
}

export function commentary(log: readonly MatchEvent[], limit = 150): CommentaryLine[] {
	const effective = resolveLog(log);
	const start = Math.max(0, effective.length - limit);
	let state = replay(effective.slice(0, start));
	const lines: CommentaryLine[] = [];
	for (const event of effective.slice(start)) {
		const before = state;
		state = applyEvent(state, event);
		const line = describe(before, state, event);
		if (line !== null) lines.push(line);
	}
	return lines.reverse();
}

const name = (s: MatchState, id: string | null) => format.playerName(s, id);

function describe(before: MatchState, after: MatchState, event: PlayEvent): CommentaryLine | null {
	const seq = event.seq;
	switch (event.type) {
		case "DELIVERY": {
			let text = format.deliveryCommentary(before, event);
			const p = event.payload;
			const d = p.dismissal;
			if (d !== null) {
				const inn = after.innings[after.innings.length - 1];
				const line = inn?.batters.find((b) => b.playerId === d.batterId);
				if (inn !== undefined && line !== undefined) {
					text += ` ${name(after, d.batterId)} ${format.dismissalText(after, inn, line)} ${line.runs} (${line.balls})`;
				}
				return { seq, kind: "wicket", text };
			}
			const offBat = p.extra === null || (p.extra.kind === "NO_BALL" && p.extra.runsFrom === "BAT");
			if (offBat && !p.overthrow && p.boundary === "SIX") return { seq, kind: "six", text };
			if (offBat && !p.overthrow && p.boundary === "FOUR") return { seq, kind: "four", text };
			return { seq, kind: "ball", text };
		}
		case "END_OF_OVER": {
			const inn = after.innings[after.innings.length - 1];
			const over = inn?.overs.at(-1);
			if (inn === undefined || over === undefined) return null;
			const team = format.teamName(after, inn.battingTeamId);
			return {
				seq,
				kind: "over",
				text: `End of over ${over.index + 1}: ${over.runs} run${over.runs === 1 ? "" : "s"}${over.wickets > 0 ? `, ${over.wickets} wkt${over.wickets === 1 ? "" : "s"}` : ""} · ${team} ${inn.runs}/${inn.wickets}`,
			};
		}
		case "TOSS":
			return {
				seq,
				kind: "info",
				text: `${format.teamName(after, event.payload.winnerTeamId)} won the toss and chose to ${event.payload.decision === "BAT" ? "bat" : "bowl"}.`,
			};
		case "INNINGS_STARTED": {
			const p = event.payload;
			return {
				seq,
				kind: "info",
				text: `${format.teamName(after, p.battingTeamId)} innings: ${name(after, p.strikerId)} and ${name(after, p.nonStrikerId)} open; ${name(after, p.bowlerId)} to bowl.`,
			};
		}
		case "BATTER_IN":
			return {
				seq,
				kind: "info",
				text: `${name(after, event.payload.batterId)} comes to the crease.`,
			};
		case "BOWLER_CHANGE":
			return event.payload.reason === "NEW_OVER"
				? null
				: {
						seq,
						kind: "info",
						text: `${name(after, event.payload.bowlerId)} takes over mid-over.`,
					};
		case "WICKET": {
			const inn = after.innings[after.innings.length - 1];
			const line = inn?.batters.find((b) => b.playerId === event.payload.batterId);
			const how =
				inn !== undefined && line !== undefined ? format.dismissalText(after, inn, line) : "out";
			return { seq, kind: "wicket", text: `OUT! ${name(after, event.payload.batterId)} ${how}.` };
		}
		case "RETIREMENT":
			return {
				seq,
				kind: "info",
				text: `${name(after, event.payload.batterId)} retires ${event.payload.kind === "HURT" ? "hurt" : "out"}.`,
			};
		case "PENALTY_RUNS":
			return {
				seq,
				kind: "info",
				text: `${event.payload.runs} penalty runs to ${format.teamName(after, event.payload.toTeamId)}${event.payload.reason === "" ? "" : ` (${event.payload.reason})`}.`,
			};
		case "INTERRUPTION":
			return {
				seq,
				kind: "info",
				text: `Play stopped: ${event.payload.kind.toLowerCase().replace("_", " ")}.`,
			};
		case "PLAY_RESUMED":
			return {
				seq,
				kind: "info",
				text: `Play resumes${event.payload.revisedOvers === null ? "" : `, ${event.payload.revisedOvers} overs per side`}.`,
			};
		case "DECLARATION":
			return {
				seq,
				kind: "info",
				text: `${format.teamName(after, event.payload.teamId)} declare.`,
			};
		case "SUPER_OVER_STARTED":
			return { seq, kind: "info", text: "Scores level: super over!" };
		case "MATCH_RESULT":
			return { seq, kind: "info", text: `${format.resultText(after, event.payload.result)}.` };
		case "INNINGS_ENDED":
			return {
				seq,
				kind: "info",
				text: event.payload.reason === "FORFEITED" ? "Innings forfeited." : "All out.",
			};
		default:
			// MATCH_STARTED, SWAP_STRIKE, SUBSTITUTION, FOLLOW_ON, TARGET_REVISED, BOWL_OUT_RESULT
			return null;
	}
}
