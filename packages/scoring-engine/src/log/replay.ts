/** Replay: fold the effective log through the reducer (R-LC-05). */
import { clone } from "../internal/clone";
import { initialState, reduceInPlace, withSeq } from "../reducer/apply";
import type { EngineOptions } from "../reducer/officials";
import type { MatchEvent, PlayEvent } from "../types/events";
import type { MatchState } from "../types/state";
import { isLogEvent, resolveLog } from "./resolve";

function fold(draft: MatchState, events: readonly PlayEvent[], options: EngineOptions): MatchState {
	for (const event of events) {
		try {
			reduceInPlace(draft, event, options);
		} catch (error) {
			throw withSeq(error, event.seq);
		}
	}
	return draft;
}

/** Full replay of a stored log, resolving UNDO and CORRECTION first. */
export function replay(log: readonly MatchEvent[], options: EngineOptions = {}): MatchState {
	return fold(initialState(), resolveLog(log), options);
}

/**
 * Continue from a snapshot. `tail` must not contain UNDO/CORRECTION events that reach before
 * the snapshot; callers fall back to a full replay for those.
 */
export function replayFrom(
	snapshot: MatchState,
	tail: readonly PlayEvent[],
	options: EngineOptions = {},
): MatchState {
	return fold(clone(snapshot), tail, options);
}

/**
 * Append one event to a log and return the new log and state. Play events apply incrementally;
 * UNDO / CORRECTION trigger a full replay. Throws RuleViolation and leaves inputs untouched.
 */
export function appendEvent(
	log: readonly MatchEvent[],
	state: MatchState,
	event: MatchEvent,
	options: EngineOptions = {},
): { log: MatchEvent[]; state: MatchState } {
	const next = [...log, event];
	if (isLogEvent(event)) return { log: next, state: replay(next, options) };
	const draft = clone(state);
	try {
		reduceInPlace(draft, event, options);
	} catch (error) {
		throw withSeq(error, event.seq);
	}
	return { log: next, state: draft };
}
