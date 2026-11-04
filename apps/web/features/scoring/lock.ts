/**
 * The scoring lock (PHASE_4_PLAN.md §1 Q3, §3): one active scorer per match, as a lease that the
 * holder renews by heartbeat. All functions serialise on the match row, the same lock
 * `submitEvent` takes, so a lock change and an event write can never interleave.
 */
import { authorize } from "@cricket/authz";
import { schema, type Executor } from "@cricket/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { matchResource } from "@/features/matches/service";
import type { ServiceContext } from "@/lib/services/context";
import { audit } from "@/lib/services/audit";
import { notFound } from "@/lib/services/errors";
import { parse } from "@/lib/services/result";
import { ScoringError, type LockView } from "./errors";

const { matches, matchScoringLocks } = schema;

/** A lease lasts this long without a heartbeat. Clients renew every LOCK_TTL_MS / 3. */
export const LOCK_TTL_MS = 60_000;

type Row = typeof matchScoringLocks.$inferSelect;
type Tx = Executor;

const DeviceId = z.string().min(1).max(100);
const AcquireInput = z.strictObject({ deviceId: DeviceId });
const HandoffInput = z.strictObject({
	deviceId: DeviceId,
	/** Null cancels a pending offer. */
	toUserId: z.uuid().nullable(),
	toDeviceId: DeviceId.nullable().default(null),
});
const TakeoverInput = z.strictObject({
	deviceId: DeviceId,
	/** Required to take a lock that has not expired. */
	reason: z.string().trim().min(1).max(500).optional(),
});

export const toLockView = (r: Row): LockView => ({
	holderUserId: r.holderUserId,
	holderDeviceId: r.holderDeviceId,
	generation: r.generation,
	expiresAt: r.expiresAt.toISOString(),
	handoffToUserId: r.handoffToUserId,
	handoffToDeviceId: r.handoffToDeviceId,
});

const live = (r: Row, now: Date) => r.expiresAt.getTime() > now.getTime();
const heldBy = (r: Row, userId: string, deviceId: string) =>
	r.holderUserId === userId && r.holderDeviceId === deviceId;
const offeredTo = (r: Row, userId: string, deviceId: string) =>
	r.handoffToUserId === userId &&
	(r.handoffToDeviceId === null || r.handoffToDeviceId === deviceId);
const expiry = (now: Date) => new Date(now.getTime() + LOCK_TTL_MS);

async function load(tx: Tx, matchId: string): Promise<Row | undefined> {
	return (
		await tx.select().from(matchScoringLocks).where(eq(matchScoringLocks.matchId, matchId))
	)[0];
}

/** Lock the match row (serialising with event writes) and authorize `action` on it. */
async function enter(
	tx: Tx,
	ctx: ServiceContext,
	matchId: string,
	action: "match.score" | "match.manage",
) {
	const [m] = await tx
		.select({ id: matches.id })
		.from(matches)
		.where(eq(matches.id, matchId))
		.for("update");
	if (m === undefined) throw notFound("Match");
	authorize(ctx.subject, action, await matchResource(tx, matchId));
	return ctx.subject;
}

const locked = (row: Row | undefined, code: string, message: string) =>
	new ScoringError(423, code, message, { lock: row === undefined ? null : toLockView(row) });

/** Called by `submitEvent` inside its transaction, after the match row is locked. */
export async function requireLock(
	tx: Tx,
	matchId: string,
	userId: string,
	deviceId: string,
	generation: number | undefined,
	now = new Date(),
): Promise<void> {
	const row = await load(tx, matchId);
	if (row === undefined || !live(row, now)) {
		throw locked(row, "LOCK_REQUIRED", "Take the scoring lock before scoring");
	}
	if (
		!heldBy(row, userId, deviceId) ||
		(generation !== undefined && generation !== row.generation)
	) {
		throw locked(row, "LOCK_LOST", "Another scorer holds the scoring lock");
	}
}

/**
 * Take the lock: free or expired, already ours (renews), or offered to us by the holder.
 * Returns the lock; `generation` changes whenever the holder does.
 */
export async function acquireLock(
	ctx: ServiceContext,
	matchId: string,
	raw: unknown,
	now = new Date(),
): Promise<LockView> {
	const input = parse(AcquireInput, raw);
	return ctx.db.transaction(async (tx) => {
		const subject = await enter(tx, ctx, matchId, "match.score");
		const row = await load(tx, matchId);
		const mine = row !== undefined && heldBy(row, subject.userId, input.deviceId);
		const free = row === undefined || !live(row, now);
		const offered = row !== undefined && offeredTo(row, subject.userId, input.deviceId);
		if (!mine && !free && !offered) {
			throw locked(row, "LOCKED", "Another scorer holds the scoring lock");
		}

		const lease = {
			holderUserId: subject.userId,
			holderDeviceId: input.deviceId,
			heartbeatAt: now,
			expiresAt: expiry(now),
			handoffToUserId: null,
			handoffToDeviceId: null,
		};
		if (row !== undefined && mine) {
			// Renewing an unexpired or lapsed lease nobody else took keeps the generation.
			const [next] = await tx
				.update(matchScoringLocks)
				.set({
					...lease,
					handoffToUserId: row.handoffToUserId,
					handoffToDeviceId: row.handoffToDeviceId,
				})
				.where(eq(matchScoringLocks.matchId, matchId))
				.returning();
			return toLockView(next!);
		}
		const generation = (row?.generation ?? 0) + 1;
		const fresh = { ...lease, generation, acquiredAt: now };
		const [next] = await tx
			.insert(matchScoringLocks)
			.values({ matchId, ...fresh })
			.onConflictDoUpdate({ target: matchScoringLocks.matchId, set: fresh })
			.returning();
		await audit(tx, {
			actorId: subject.userId,
			action: offered ? "scoring.lock.handoff_accept" : "scoring.lock.acquire",
			resourceType: "match",
			resourceId: matchId,
			before: row === undefined ? null : { holder: row.holderUserId, generation: row.generation },
			after: { holder: subject.userId, deviceId: input.deviceId, generation },
		});
		return toLockView(next!);
	});
}

/** Renew the lease. Only the current holder may, even after a lapse nobody else took over. */
export async function heartbeatLock(
	ctx: ServiceContext,
	matchId: string,
	raw: unknown,
	now = new Date(),
): Promise<LockView> {
	const input = parse(AcquireInput, raw);
	return ctx.db.transaction(async (tx) => {
		const subject = await enter(tx, ctx, matchId, "match.score");
		const row = await load(tx, matchId);
		if (row === undefined || !heldBy(row, subject.userId, input.deviceId)) {
			throw locked(row, "LOCK_LOST", "You no longer hold the scoring lock");
		}
		const [next] = await tx
			.update(matchScoringLocks)
			.set({ heartbeatAt: now, expiresAt: expiry(now) })
			.where(eq(matchScoringLocks.matchId, matchId))
			.returning();
		return toLockView(next!);
	});
}

/** Give the lock up. The row stays (expired) so the generation keeps growing. */
export async function releaseLock(
	ctx: ServiceContext,
	matchId: string,
	raw: unknown,
	now = new Date(),
): Promise<{ released: boolean }> {
	const input = parse(AcquireInput, raw);
	return ctx.db.transaction(async (tx) => {
		const subject = await enter(tx, ctx, matchId, "match.score");
		const row = await load(tx, matchId);
		if (row === undefined || !heldBy(row, subject.userId, input.deviceId) || !live(row, now)) {
			return { released: false };
		}
		await tx
			.update(matchScoringLocks)
			.set({ expiresAt: now, handoffToUserId: null, handoffToDeviceId: null })
			.where(eq(matchScoringLocks.matchId, matchId));
		await audit(tx, {
			actorId: subject.userId,
			action: "scoring.lock.release",
			resourceType: "match",
			resourceId: matchId,
			before: { holder: row.holderUserId, generation: row.generation },
		});
		return { released: true };
	});
}

/**
 * Offer the lock to another scorer (they accept by calling `acquireLock`), or cancel the offer
 * with `toUserId: null`. The target must be allowed to score.
 */
export async function offerHandoff(
	ctx: ServiceContext,
	matchId: string,
	raw: unknown,
	now = new Date(),
): Promise<LockView> {
	const input = parse(HandoffInput, raw);
	return ctx.db.transaction(async (tx) => {
		const subject = await enter(tx, ctx, matchId, "match.score");
		const row = await load(tx, matchId);
		if (row === undefined || !heldBy(row, subject.userId, input.deviceId) || !live(row, now)) {
			throw locked(row, "LOCK_LOST", "Only the current scorer can hand the lock over");
		}
		const [next] = await tx
			.update(matchScoringLocks)
			.set({
				handoffToUserId: input.toUserId,
				handoffToDeviceId: input.toUserId === null ? null : input.toDeviceId,
			})
			.where(eq(matchScoringLocks.matchId, matchId))
			.returning();
		await audit(tx, {
			actorId: subject.userId,
			action:
				input.toUserId === null ? "scoring.lock.handoff_cancel" : "scoring.lock.handoff_offer",
			resourceType: "match",
			resourceId: matchId,
			after: { toUserId: input.toUserId, toDeviceId: input.toDeviceId },
		});
		return toLockView(next!);
	});
}

/** The match's manager takes the lock: once it has expired, or with a reason before that. */
export async function takeOverLock(
	ctx: ServiceContext,
	matchId: string,
	raw: unknown,
	now = new Date(),
): Promise<LockView> {
	const input = parse(TakeoverInput, raw);
	return ctx.db.transaction(async (tx) => {
		const subject = await enter(tx, ctx, matchId, "match.manage");
		const row = await load(tx, matchId);
		if (row !== undefined && live(row, now) && !heldBy(row, subject.userId, input.deviceId)) {
			if (input.reason === undefined) {
				throw locked(row, "LOCKED", "The lock is held; give a reason to take it over");
			}
		}
		const generation = (row?.generation ?? 0) + 1;
		const fresh = {
			holderUserId: subject.userId,
			holderDeviceId: input.deviceId,
			generation,
			acquiredAt: now,
			heartbeatAt: now,
			expiresAt: expiry(now),
			handoffToUserId: null,
			handoffToDeviceId: null,
		};
		const [next] = await tx
			.insert(matchScoringLocks)
			.values({ matchId, ...fresh })
			.onConflictDoUpdate({ target: matchScoringLocks.matchId, set: fresh })
			.returning();
		await audit(tx, {
			actorId: subject.userId,
			action: "scoring.lock.takeover",
			resourceType: "match",
			resourceId: matchId,
			before: row === undefined ? null : { holder: row.holderUserId, generation: row.generation },
			after: {
				holder: subject.userId,
				deviceId: input.deviceId,
				generation,
				reason: input.reason ?? null,
			},
		});
		return toLockView(next!);
	});
}

/** The current lock for display (null when none was ever taken). Scorers only. */
export async function getLock(
	ctx: ServiceContext,
	matchId: string,
): Promise<{ lock: LockView | null; live: boolean }> {
	const row = await load(ctx.db, matchId);
	authorize(ctx.subject, "match.score", await matchResource(ctx.db, matchId));
	return {
		lock: row === undefined ? null : toLockView(row),
		live: row !== undefined && live(row, new Date()),
	};
}
