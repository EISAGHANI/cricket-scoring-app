/**
 * Realtime contract shared by the web app (publisher) and `apps/realtime` (fan-out), per
 * PHASE_4_PLAN.md §3. Redis channels carry JSON; Socket.IO rooms use the same names.
 */
import { z } from "zod";
import { MatchEventSchema } from "./events";

/** Every accepted event, in order: `{ seq, event }`. Public (scorecards are public). */
export const matchChannel = (matchId: string) => `match:${matchId}`;
/** Match status changes (started, finished, undo reopened it). Public. */
export const matchMetaChannel = (matchId: string) => `match:${matchId}:meta`;
/** Lock changes. Scorers only: it names users and devices. */
export const matchLockChannel = (matchId: string) => `match:${matchId}:lock`;

export const MATCH_CHANNEL = /^match:([0-9a-f-]{36})(?::(meta|lock))?$/;

export const EventMessageSchema = z.object({
	seq: z.number().int().positive(),
	event: MatchEventSchema,
});
export type EventMessage = z.infer<typeof EventMessageSchema>;

export const MetaMessageSchema = z.object({
	lastSeq: z.number().int().nonnegative(),
	status: z.enum(["SCHEDULED", "LIVE", "COMPLETED", "ABANDONED", "CANCELLED"]),
});
export type MetaMessage = z.infer<typeof MetaMessageSchema>;

export const LockMessageSchema = z.object({
	holderUserId: z.uuid(),
	holderDeviceId: z.string(),
	generation: z.number().int().positive(),
	expiresAt: z.iso.datetime(),
	handoffToUserId: z.uuid().nullable(),
	handoffToDeviceId: z.string().nullable(),
	/** True after a release: nobody holds the lock. */
	released: z.boolean().default(false),
});
export type LockMessage = z.infer<typeof LockMessageSchema>;
