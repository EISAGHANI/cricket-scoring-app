/** Pure pieces of the offline sync queue (PHASE_4_PLAN.md §4): backoff and reload recovery. */
import {
	RuleViolation,
	appendEvent,
	replay,
	type MatchEvent,
	type MatchState,
} from "@cricket/scoring-engine";

const BASE_MS = 1000;
const MAX_MS = 30_000;

/** Exponential backoff with jitter (50–100% of the step), capped at 30 s. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
	const step = Math.min(MAX_MS, BASE_MS * 2 ** Math.max(0, attempt));
	return Math.round(step * (0.5 + random() * 0.5));
}

export interface Recovered {
	log: MatchEvent[];
	state: MatchState;
	/** The tail still to upload, already applied to `log`. */
	queue: MatchEvent[];
	/** Events the server already has (acked, but the outbox was not told). */
	alreadySaved: MatchEvent[];
	/** Events that no longer apply to the server's log and were dropped. */
	dropped: MatchEvent[];
}

/**
 * Rebuild the scorer's state after a reload: the server's log plus the outbox tail. A tail event
 * whose id the server already has is done; the first one that doesn't continue the log (a gap,
 * or the engine refuses it) ends the recovery and it and everything after it are dropped.
 */
export function recoverTail(serverLog: MatchEvent[], tail: readonly MatchEvent[]): Recovered {
	const known = new Set(serverLog.map((e) => e.id));
	let log = serverLog;
	let state = replay(serverLog);
	const queue: MatchEvent[] = [];
	const alreadySaved: MatchEvent[] = [];
	const dropped: MatchEvent[] = [];
	for (const event of tail) {
		if (dropped.length > 0) {
			dropped.push(event);
			continue;
		}
		if (known.has(event.id)) {
			alreadySaved.push(event);
			continue;
		}
		const head = log.at(-1)?.seq ?? 0;
		if (event.seq !== head + 1) {
			dropped.push(event);
			continue;
		}
		try {
			const next = appendEvent(log, state, event);
			log = next.log;
			state = next.state;
			queue.push(event);
		} catch (error) {
			if (!(error instanceof RuleViolation)) throw error;
			dropped.push(event);
		}
	}
	return { log, state, queue, alreadySaved, dropped };
}
