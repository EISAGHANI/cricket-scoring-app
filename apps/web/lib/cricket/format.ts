import type { BatterLine } from "./engine";
import type { DismissalKind, Id, Match, Player } from "./types";

/** 27 legal balls -> "4.3" */
export function oversText(legalBalls: number) {
	return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

/** Runs per over, two decimals; "-" before the first legal ball. */
export function runRate(runs: number, legalBalls: number) {
	return legalBalls > 0 ? ((runs * 6) / legalBalls).toFixed(2) : "-";
}

export function strikeRate(runs: number, balls: number) {
	return balls > 0 ? ((runs * 100) / balls).toFixed(1) : "-";
}

export const economy = runRate;

export function playerLookup(match: Match) {
	const map = new Map<Id, Player>();
	for (const t of match.teams) for (const p of t.players) map.set(p.id, p);
	return (id: Id | null | undefined) => (id ? (map.get(id)?.name ?? "Unknown") : "");
}

export const DISMISSAL_LABEL: Record<DismissalKind, string> = {
	bowled: "Bowled",
	caught: "Caught",
	lbw: "LBW",
	runOut: "Run out",
	stumped: "Stumped",
	hitWicket: "Hit wicket",
};

/** Scorecard-style dismissal, e.g. "c Smith b Jones". */
export function dismissalText(line: BatterLine, name: (id: Id | undefined) => string) {
	const d = line.dismissal;
	if (!d) return "not out";
	const b = name(d.bowlerId);
	const f = name(d.fielderId);
	switch (d.kind) {
		case "bowled":
			return `b ${b}`;
		case "caught":
			return d.fielderId && d.fielderId === d.bowlerId ? `c & b ${b}` : `c ${f || "sub"} b ${b}`;
		case "lbw":
			return `lbw b ${b}`;
		case "stumped":
			return `st ${f || "keeper"} b ${b}`;
		case "hitWicket":
			return `hit wicket b ${b}`;
		case "runOut":
			return f ? `run out (${f})` : "run out";
	}
}

export function initials(name: string) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function shortNameFrom(name: string) {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length >= 2)
		return words
			.map((w) => w[0])
			.join("")
			.slice(0, 4)
			.toUpperCase();
	return name.trim().slice(0, 3).toUpperCase();
}

export function relativeDate(ts: number, now = Date.now()) {
	const diff = now - ts;
	const min = 60_000,
		hour = 60 * min,
		day = 24 * hour;
	if (diff < min) return "just now";
	if (diff < hour) return `${Math.floor(diff / min)} min ago`;
	if (diff < day) return `${Math.floor(diff / hour)} h ago`;
	if (diff < 7 * day) return `${Math.floor(diff / day)} d ago`;
	return new Date(ts).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}
