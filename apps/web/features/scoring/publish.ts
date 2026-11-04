import {
	matchChannel,
	matchLockChannel,
	matchMetaChannel,
	type EventMessage,
	type LockMessage,
	type MetaMessage,
} from "@cricket/schemas";
import type { Submitted } from "./service";
import type { LockView } from "./errors";

export type Publish = (channel: string, message: unknown) => Promise<void>;

/** Fan out committed events, in order; a status change also goes to the meta channel. */
export async function publishEvents(
	publish: Publish,
	matchId: string,
	stored: readonly Submitted[],
): Promise<void> {
	for (const s of stored) {
		const message: EventMessage = { seq: s.event.seq, event: s.event };
		await publish(matchChannel(matchId), message);
	}
	const last = stored.at(-1);
	if (last && stored.some((s) => s.statusChanged)) {
		const meta: MetaMessage = { lastSeq: last.lastSeq, status: last.status };
		await publish(matchMetaChannel(matchId), meta);
	}
}

export async function publishLock(
	publish: Publish,
	matchId: string,
	lock: LockView | null,
	released = false,
): Promise<void> {
	if (!lock) return;
	const message: LockMessage = { ...lock, released };
	await publish(matchLockChannel(matchId), message);
}
