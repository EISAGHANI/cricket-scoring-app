import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { roleAssignments, teamPlayers, teams, players, users } from "./schema";
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
