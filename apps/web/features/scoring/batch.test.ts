/** Integration tests (real Postgres): batch submit and publishing (PHASE_4_PLAN M2). */
import { schema } from "@cricket/db";
import { createTestDb, resetDatabase } from "@cricket/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createMatch, startPayload } from "@/features/matches/service";
import { createTeam } from "@/features/teams/service";
import { as, makeUser } from "@/test/fixtures";
import { acquireLock } from "./lock";
import { publishEvents } from "./publish";
import { submitBatch, type Submitted } from "./service";

const { db, close } = createTestDb();
afterAll(close);
beforeEach(() => resetDatabase(db));

async function setup() {
	const manager = await makeUser(db, "Manager");
	const other = await makeUser(db, "Other");
	const home = await createTeam(await as(db, manager), { name: "Lions", shortName: "LIO" });
	const away = await createTeam(await as(db, other), { name: "Tigers", shortName: "TIG" });
	const ids = async (names: string[]) =>
		(
			await db
				.insert(schema.players)
				.values(
					names.map((n) => ({
						displayName: n,
						slug: `${n}-${crypto.randomUUID()}`.toLowerCase(),
						dateOfBirth: null,
					})),
				)
				.returning({ id: schema.players.id })
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
		scorerIds: [],
	});
	const ctx = await as(db, manager);
	await acquireLock(ctx, match.id, { deviceId: "d1" });
	return { ctx, matchId: match.id, h, a, match };
}

const wrap = (matchId: string, seq: number, type: string, payload: unknown, id?: string) => ({
	matchId,
	event: { id: id ?? crypto.randomUUID(), seq, type, payload },
	deviceId: "d1",
	clientTimestamp: new Date().toISOString(),
	schemaVersion: 1 as const,
});

describe("submitBatch", () => {
	it("accepts a tail in order and reports duplicates on replay", async () => {
		const { ctx, matchId } = await setup();
		const start = wrap(matchId, 1, "MATCH_STARTED", await startPayload(db, matchId));
		const first = await submitBatch(ctx, matchId, [start]);
		expect(first.result.failed).toBeNull();
		expect(first.result.accepted).toHaveLength(1);
		expect(first.stored).toHaveLength(1);

		const replay = await submitBatch(ctx, matchId, [start]);
		expect(replay.result.accepted[0]?.duplicate).toBe(true);
		expect(replay.stored).toHaveLength(0);
		expect(replay.result.lastSeq).toBe(1);
	});

	it("stops at the first rejection and keeps what was accepted", async () => {
		const { ctx, matchId } = await setup();
		const start = wrap(matchId, 1, "MATCH_STARTED", await startPayload(db, matchId));
		const gap = wrap(matchId, 5, "DELIVERY", {});
		const { result } = await submitBatch(ctx, matchId, [
			start,
			gap,
			wrap(matchId, 2, "DELIVERY", {}),
		]);
		expect(result.accepted).toHaveLength(1);
		expect(result.failed?.index).toBe(1);
		expect(result.lastSeq).toBe(1);
	});

	it("rejects empty and oversized batches", async () => {
		const { ctx, matchId } = await setup();
		await expect(submitBatch(ctx, matchId, [])).rejects.toThrow();
		await expect(submitBatch(ctx, matchId, "nope")).rejects.toThrow();
	});
});

describe("publishEvents", () => {
	it("publishes each event then one meta message when status changed", async () => {
		const sent: [string, unknown][] = [];
		const mk = (seq: number, statusChanged: boolean) =>
			({
				lastSeq: seq,
				duplicate: false,
				statusChanged,
				event: { id: crypto.randomUUID(), seq, type: "DELIVERY", payload: {} },
				status: "LIVE",
			}) as unknown as Submitted;
		const id = crypto.randomUUID();
		await publishEvents(async (c, m) => void sent.push([c, m]), id, [mk(1, true), mk(2, false)]);
		expect(sent.map(([c]) => c)).toEqual([`match:${id}`, `match:${id}`, `match:${id}:meta`]);
		expect(sent[2]?.[1]).toEqual({ lastSeq: 2, status: "LIVE" });
	});
});
