/** Integration tests (real Postgres): the scoring lock (PHASE_4_PLAN M1). */
import { Forbidden } from "@cricket/authz";
import { schema } from "@cricket/db";
import { createTestDb, resetDatabase } from "@cricket/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createMatch } from "@/features/matches/service";
import { createTeam } from "@/features/teams/service";
import { as, makeUser } from "@/test/fixtures";
import {
	LOCK_TTL_MS,
	acquireLock,
	getLock,
	heartbeatLock,
	offerHandoff,
	releaseLock,
	requireLock,
	takeOverLock,
} from "./lock";

const { db, close } = createTestDb();
afterAll(close);
beforeEach(() => resetDatabase(db));

const { players, auditLog } = schema;
const T0 = new Date("2026-01-01T10:00:00Z");
const after = (ms: number) => new Date(T0.getTime() + ms);

async function setup() {
	const manager = await makeUser(db, "Manager");
	const opponent = await makeUser(db, "Opponent");
	const scorerA = await makeUser(db, "Scorer A");
	const scorerB = await makeUser(db, "Scorer B");
	const outsider = await makeUser(db, "Outsider");
	const home = await createTeam(await as(db, manager), { name: "Lions", shortName: "LIO" });
	const away = await createTeam(await as(db, opponent), { name: "Tigers", shortName: "TIG" });
	const ids = async (names: string[]) =>
		(
			await db
				.insert(players)
				.values(
					names.map((n) => ({
						displayName: n,
						slug: `${n}-${crypto.randomUUID()}`.toLowerCase(),
					})),
				)
				.returning({ id: players.id })
		).map((r) => r.id);
	const h = await ids(["Ann", "Bea", "Cat"]);
	const a = await ids(["Dan", "Eve", "Fay"]);
	const match = await createMatch(await as(db, manager), {
		homeTeamId: home.id,
		awayTeamId: away.id,
		preset: "T20" as const,
		oversPerInnings: 1,
		playersPerSide: 3,
		home: { playerIds: h, captainId: h[0]!, keeperId: h[1]! },
		away: { playerIds: a, captainId: a[0]!, keeperId: a[2]! },
		umpire1: "Dickie Bird",
		scorerIds: [scorerA, scorerB],
	});
	return { manager, scorerA, scorerB, outsider, matchId: match.id };
}

const acquire = async (userId: string, matchId: string, deviceId: string, now = T0) =>
	acquireLock(await as(db, userId), matchId, { deviceId }, now);

describe("scoring lock", () => {
	it("is taken by one scorer at a time", async () => {
		const { scorerA, scorerB, matchId } = await setup();
		const lock = await acquire(scorerA, matchId, "phone-a");
		expect(lock).toMatchObject({ holderUserId: scorerA, generation: 1 });
		expect(lock.expiresAt).toBe(after(LOCK_TTL_MS).toISOString());

		await expect(acquire(scorerB, matchId, "phone-b", after(1000))).rejects.toMatchObject({
			status: 423,
			code: "LOCKED",
			details: { lock: { holderUserId: scorerA } },
		});
		// Even the holder on another device must hand over explicitly.
		await expect(acquire(scorerA, matchId, "tablet-a", after(1000))).rejects.toMatchObject({
			code: "LOCKED",
		});
	});

	it("needs permission to score", async () => {
		const { outsider, matchId } = await setup();
		await expect(acquire(outsider, matchId, "d")).rejects.toBeInstanceOf(Forbidden);
		await expect(
			acquireLock(await as(db, null), matchId, { deviceId: "d" }, T0),
		).rejects.toBeInstanceOf(Forbidden);
		await expect(acquire(outsider, crypto.randomUUID(), "d")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("renews on heartbeat and by re-acquiring, keeping the generation", async () => {
		const { scorerA, matchId } = await setup();
		await acquire(scorerA, matchId, "phone-a");
		const beat = await heartbeatLock(
			await as(db, scorerA),
			matchId,
			{ deviceId: "phone-a" },
			after(30_000),
		);
		expect(beat).toMatchObject({
			generation: 1,
			expiresAt: after(30_000 + LOCK_TTL_MS).toISOString(),
		});
		// A lapse that nobody used: the holder gets back in without bumping the generation.
		const again = await acquire(scorerA, matchId, "phone-a", after(10 * LOCK_TTL_MS));
		expect(again.generation).toBe(1);
		await expect(
			heartbeatLock(await as(db, scorerA), matchId, { deviceId: "other" }, after(1)),
		).rejects.toMatchObject({ code: "LOCK_LOST" });
	});

	it("passes to someone else once it expires, bumping the generation", async () => {
		const { scorerA, scorerB, matchId } = await setup();
		await acquire(scorerA, matchId, "phone-a");
		const lock = await acquire(scorerB, matchId, "phone-b", after(LOCK_TTL_MS + 1));
		expect(lock).toMatchObject({ holderUserId: scorerB, generation: 2 });
		// The old holder can neither heartbeat nor write.
		await expect(
			heartbeatLock(
				await as(db, scorerA),
				matchId,
				{ deviceId: "phone-a" },
				after(LOCK_TTL_MS + 2),
			),
		).rejects.toMatchObject({ code: "LOCK_LOST" });
		await expect(
			requireLock(db, matchId, scorerA, "phone-a", 1, after(LOCK_TTL_MS + 2)),
		).rejects.toMatchObject({ status: 423, code: "LOCK_LOST" });
	});

	it("hands over to an offered user, who accepts by acquiring", async () => {
		const { scorerA, scorerB, matchId } = await setup();
		await acquire(scorerA, matchId, "phone-a");
		const offer = await offerHandoff(
			await as(db, scorerA),
			matchId,
			{ deviceId: "phone-a", toUserId: scorerB, toDeviceId: "phone-b" },
			after(1000),
		);
		expect(offer).toMatchObject({ handoffToUserId: scorerB, handoffToDeviceId: "phone-b" });
		// The wrong device cannot accept it.
		await expect(acquire(scorerB, matchId, "other", after(2000))).rejects.toMatchObject({
			code: "LOCKED",
		});
		const lock = await acquire(scorerB, matchId, "phone-b", after(2000));
		expect(lock).toMatchObject({
			holderUserId: scorerB,
			generation: 2,
			handoffToUserId: null,
			handoffToDeviceId: null,
		});
		await expect(
			requireLock(db, matchId, scorerA, "phone-a", undefined, after(3000)),
		).rejects.toMatchObject({ code: "LOCK_LOST" });
		await requireLock(db, matchId, scorerB, "phone-b", 2, after(3000));
	});

	it("lets the holder cancel an offer; only the holder may offer", async () => {
		const { scorerA, scorerB, matchId } = await setup();
		await acquire(scorerA, matchId, "phone-a");
		const ctxA = await as(db, scorerA);
		await offerHandoff(ctxA, matchId, { deviceId: "phone-a", toUserId: scorerB }, after(1));
		const cancelled = await offerHandoff(
			ctxA,
			matchId,
			{ deviceId: "phone-a", toUserId: null },
			after(2),
		);
		expect(cancelled.handoffToUserId).toBeNull();
		await expect(acquire(scorerB, matchId, "phone-b", after(3))).rejects.toMatchObject({
			code: "LOCKED",
		});
		await expect(
			offerHandoff(
				await as(db, scorerB),
				matchId,
				{ deviceId: "phone-b", toUserId: scorerA },
				after(3),
			),
		).rejects.toMatchObject({ code: "LOCK_LOST" });
	});

	it("is released by the holder and then free for anyone; generation keeps growing", async () => {
		const { scorerA, scorerB, matchId } = await setup();
		await acquire(scorerA, matchId, "phone-a");
		const ctxB = await as(db, scorerB);
		await expect(releaseLock(ctxB, matchId, { deviceId: "phone-b" }, after(1))).resolves.toEqual({
			released: false,
		});
		await expect(
			releaseLock(await as(db, scorerA), matchId, { deviceId: "phone-a" }, after(2)),
		).resolves.toEqual({ released: true });
		await expect(requireLock(db, matchId, scorerA, "phone-a", 1, after(3))).rejects.toMatchObject({
			code: "LOCK_REQUIRED",
		});
		expect((await acquire(scorerB, matchId, "phone-b", after(3))).generation).toBe(2);
	});

	it("can be taken over by the match manager: freely when expired, with a reason otherwise", async () => {
		const { manager, scorerA, matchId } = await setup();
		await acquire(scorerA, matchId, "phone-a");
		const ctx = await as(db, manager);
		await expect(
			takeOverLock(ctx, matchId, { deviceId: "desk" }, after(1000)),
		).rejects.toMatchObject({ code: "LOCKED" });
		await expect(
			takeOverLock(await as(db, scorerA), matchId, { deviceId: "x", reason: "me" }, after(1000)),
		).rejects.toBeInstanceOf(Forbidden);
		const forced = await takeOverLock(
			ctx,
			matchId,
			{ deviceId: "desk", reason: "Scorer's phone died" },
			after(1000),
		);
		expect(forced).toMatchObject({ holderUserId: manager, generation: 2 });
		const lapsed = await takeOverLock(ctx, matchId, { deviceId: "desk2" }, after(10 * LOCK_TTL_MS));
		expect(lapsed).toMatchObject({ holderDeviceId: "desk2", generation: 3 });
	});

	it("audits every change of holder", async () => {
		const { manager, scorerA, scorerB, matchId } = await setup();
		await acquire(scorerA, matchId, "phone-a");
		await offerHandoff(
			await as(db, scorerA),
			matchId,
			{ deviceId: "phone-a", toUserId: scorerB },
			after(1),
		);
		await acquire(scorerB, matchId, "phone-b", after(2));
		await releaseLock(await as(db, scorerB), matchId, { deviceId: "phone-b" }, after(3));
		await takeOverLock(await as(db, manager), matchId, { deviceId: "desk" }, after(4));
		const rows = await db.select({ action: auditLog.action }).from(auditLog);
		const actions = rows.map((r) => r.action).filter((x) => x.startsWith("scoring.lock."));
		expect(actions.sort()).toEqual(
			[
				"scoring.lock.acquire",
				"scoring.lock.handoff_offer",
				"scoring.lock.handoff_accept",
				"scoring.lock.release",
				"scoring.lock.takeover",
			].sort(),
		);
	});

	it("shows scorers the current lock", async () => {
		const { scorerA, outsider, matchId } = await setup();
		expect(await getLock(await as(db, scorerA), matchId)).toEqual({ lock: null, live: false });
		await acquire(scorerA, matchId, "phone-a", new Date());
		const shown = await getLock(await as(db, scorerA), matchId);
		expect(shown).toMatchObject({ live: true, lock: { holderUserId: scorerA } });
		await expect(getLock(await as(db, outsider), matchId)).rejects.toBeInstanceOf(Forbidden);
	});
});
