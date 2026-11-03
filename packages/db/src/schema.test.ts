import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PRESETS } from "@cricket/scoring-engine";
import {
	ballEvents,
	matches,
	matchStateSnapshots,
	roleAssignments,
	teamPlayers,
	teams,
	players,
	users,
} from "./schema";
import { createTestDb, resetDatabase } from "./testing";

const { db, close } = createTestDb();
afterAll(close);
beforeEach(() => resetDatabase(db));

describe("schema constraints", () => {
	it("generates time-ordered UUIDv7 ids in the database", async () => {
		const [a] = await db.insert(users).values({ name: "A", email: "a@example.com" }).returning();
		const [b] = await db.insert(users).values({ name: "B", email: "b@example.com" }).returning();
		expect(a!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
		expect(a!.id < b!.id).toBe(true);
	});

	it("treats emails and slugs case-insensitively", async () => {
		await db.insert(users).values({ name: "A", email: "Ann@Example.com" });
		await expect(
			db.insert(users).values({ name: "B", email: "ann@example.COM" }),
		).rejects.toThrow();
		const [found] = await db.select().from(users).where(eq(users.email, "ANN@EXAMPLE.COM"));
		expect(found?.name).toBe("A");
	});

	it("allows one platform-wide role per user (NULL scope is not distinct)", async () => {
		const [u] = await db.insert(users).values({ name: "A", email: "a@example.com" }).returning();
		const row = {
			userId: u!.id,
			role: "SUPER_ADMIN" as const,
			scopeType: "PLATFORM" as const,
			scopeId: null,
		};
		await db.insert(roleAssignments).values(row);
		await expect(db.insert(roleAssignments).values(row)).rejects.toThrow();
	});

	it("allows one open squad membership per team and player", async () => {
		const [t] = await db
			.insert(teams)
			.values({ name: "Tigers", shortName: "TIG", slug: "tigers" })
			.returning();
		const [p] = await db.insert(players).values({ displayName: "Sam", slug: "sam" }).returning();
		await db.insert(teamPlayers).values({ teamId: t!.id, playerId: p!.id });
		await expect(
			db.insert(teamPlayers).values({ teamId: t!.id, playerId: p!.id }),
		).rejects.toThrow();
		await db.update(teamPlayers).set({ leftAt: new Date() });
		await db.insert(teamPlayers).values({ teamId: t!.id, playerId: p!.id });
	});

	it("rejects invalid short names", async () => {
		await expect(
			db.insert(teams).values({ name: "X", shortName: "TOOLONGNAME", slug: "x" }),
		).rejects.toThrow();
	});
});

describe("matches and the event log", () => {
	async function match() {
		const [a] = await db.insert(teams).values({ name: "A", shortName: "A", slug: "a" }).returning();
		const [b] = await db.insert(teams).values({ name: "B", shortName: "B", slug: "b" }).returning();
		const [m] = await db
			.insert(matches)
			.values({ homeTeamId: a!.id, awayTeamId: b!.id, preset: "T20", rules: PRESETS.T20 })
			.returning();
		return { a: a!, b: b!, m: m! };
	}
	const event = (matchId: string, seq: number) => ({
		id: crypto.randomUUID(),
		matchId,
		seq,
		type: "SWAP_STRIKE",
		payload: { reason: "test" },
		schemaVersion: 1,
		engineVersion: "1.0.0",
		deviceId: "d1",
		clientTimestamp: new Date(),
	});

	it("rejects a match between a team and itself", async () => {
		const { a } = await match();
		await expect(
			db
				.insert(matches)
				.values({ homeTeamId: a.id, awayTeamId: a.id, preset: "T20", rules: PRESETS.T20 }),
		).rejects.toThrow();
	});

	it("ball_events is append-only: UPDATE and DELETE are rejected by a trigger", async () => {
		const { m } = await match();
		const e = event(m.id, 1);
		await db.insert(ballEvents).values(e);
		await expect(
			db.update(ballEvents).set({ type: "UNDO" }).where(eq(ballEvents.id, e.id)),
		).rejects.toThrow();
		await expect(db.delete(ballEvents).where(eq(ballEvents.id, e.id))).rejects.toThrow();
		// ...and so is deleting a match that has events.
		await expect(db.delete(matches).where(eq(matches.id, m.id))).rejects.toThrow();
		const rows = await db.select().from(ballEvents);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.type).toBe("SWAP_STRIKE");
	});

	it("sequence numbers are unique per match and positive", async () => {
		const { m } = await match();
		await db.insert(ballEvents).values(event(m.id, 1));
		await expect(db.insert(ballEvents).values(event(m.id, 1))).rejects.toThrow();
		await expect(db.insert(ballEvents).values(event(m.id, 0))).rejects.toThrow();
	});

	it("keeps one snapshot per match", async () => {
		const { m } = await match();
		const row = { matchId: m.id, seq: 1, engineVersion: "1.0.0", state: {} as never };
		await db.insert(matchStateSnapshots).values(row);
		await expect(db.insert(matchStateSnapshots).values(row)).rejects.toThrow();
	});
});
