/**
 * Resolves UNDO and CORRECTION events into the effective list of play events (ADR-0005 §4–5,
 * CRICKET_RULES.md §14). Nothing is ever deleted from the stored log.
 */
import { RuleViolation } from "../errors";
import type { CorrectionEvent, MatchEvent, PlayEvent } from "../types/events";

/** Fields of each event type that a CORRECTION may change (R-COR-01). */
const CORRECTABLE: Readonly<Partial<Record<PlayEvent["type"], readonly string[]>>> = {
	TOSS: ["winnerTeamId", "decision"],
	INNINGS_STARTED: ["strikerId", "nonStrikerId", "bowlerId"],
	DELIVERY: ["runs", "boundary", "overthrow", "extra", "dismissal", "penaltyRuns", "detail"],
	WICKET: ["kind", "batterId", "fielderIds"],
	BATTER_IN: ["batterId"],
	BOWLER_CHANGE: ["bowlerId"],
	PENALTY_RUNS: ["toTeamId", "runs", "reason"],
	RETIREMENT: ["batterId", "kind"],
};

type Entry = { kind: "play"; event: PlayEvent } | { kind: "correction"; event: CorrectionEvent };

function fail(code: string, rule: string, message: string, seq: number): never {
	throw new RuleViolation(code, rule, message, seq);
}

export function resolveLog(log: readonly MatchEvent[]): PlayEvent[] {
	const stack: Entry[] = [];
	const redo: { undoId: string; entry: Entry }[] = [];
	for (const event of log) {
		if (event.type === "UNDO") {
			const top = stack[stack.length - 1];
			const redoTop = redo[redo.length - 1];
			if (top !== undefined && top.event.id === event.payload.targetId) {
				if (top.event.type === "MATCH_STARTED")
					fail("CANNOT_UNDO", "R-UNDO-04", "MATCH_STARTED cannot be undone", event.seq);
				stack.pop();
				redo.push({ undoId: event.id, entry: top });
			} else if (redoTop !== undefined && redoTop.undoId === event.payload.targetId) {
				redo.pop(); // R-UNDO-03: undoing an UNDO is a redo
				stack.push(redoTop.entry);
			} else {
				fail("UNDO_NOT_LATEST", "R-UNDO-01", "Only the latest action can be undone", event.seq);
			}
			continue;
		}
		redo.length = 0;
		if (event.type === "CORRECTION") {
			const target = stack.find((e) => e.event.id === event.payload.targetId);
			if (target === undefined || target.kind !== "play") {
				fail(
					"CORRECTION_TARGET",
					"R-COR-01",
					"Corrections must target an effective play event",
					event.seq,
				);
			}
			const allowed = CORRECTABLE[target.event.type] ?? [];
			for (const key of Object.keys(event.payload.patch)) {
				if (!allowed.includes(key)) {
					fail(
						"CORRECTION_FIELD",
						"R-COR-01",
						`${target.event.type}.${key} cannot be corrected`,
						event.seq,
					);
				}
			}
			stack.push({ kind: "correction", event });
			continue;
		}
		stack.push({ kind: "play", event });
	}

	// Apply corrections in order (R-COR-02: last writer wins per field).
	const patched = new Map<string, Record<string, unknown>>();
	for (const entry of stack) {
		if (entry.kind !== "correction") continue;
		const id = entry.event.payload.targetId;
		patched.set(id, { ...(patched.get(id) ?? {}), ...entry.event.payload.patch });
	}
	const out: PlayEvent[] = [];
	for (const entry of stack) {
		if (entry.kind !== "play") continue;
		const patch = patched.get(entry.event.id);
		out.push(
			patch === undefined
				? entry.event
				: ({ ...entry.event, payload: { ...entry.event.payload, ...patch } } as PlayEvent),
		);
	}
	return out;
}

export function isLogEvent(
	event: MatchEvent,
): event is Extract<MatchEvent, { type: "UNDO" | "CORRECTION" }> {
	return event.type === "UNDO" || event.type === "CORRECTION";
}
