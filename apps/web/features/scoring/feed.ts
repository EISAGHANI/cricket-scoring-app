import type { MatchEvent } from "@cricket/scoring-engine";

/** What to do with a pushed event, given the highest `seq` already applied. */
export type PushAction = "apply" | "ignore" | "resync";

export function classifyPush(head: number, seq: number): PushAction {
	if (seq <= head) return "ignore";
	return seq === head + 1 ? "apply" : "resync";
}

/** Append events that continue the log without a gap; anything else is dropped. */
export function appendContiguous(
	log: MatchEvent[],
	head: number,
	events: readonly MatchEvent[],
): { log: MatchEvent[]; head: number } {
	const next = [...log];
	let h = head;
	for (const e of events) {
		if (e.seq === h + 1) {
			next.push(e);
			h = e.seq;
		}
	}
	return next.length === log.length ? { log, head } : { log: next, head: h };
}
