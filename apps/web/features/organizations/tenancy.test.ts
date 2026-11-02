/**
 * Integration tests (real Postgres): organisations, clubs, teams and venues, with permission and
 * tenant-isolation checks through the service layer.
 */
import { Forbidden } from "@cricket/authz";
import { schema } from "@cricket/db";
import { createTestDb, resetDatabase } from "@cricket/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClub, updateClub } from "@/features/clubs/service";
import { createTeam, updateTeam } from "@/features/teams/service";
import { createVenue } from "@/features/venues/service";
import { ServiceError } from "@/lib/services/errors";
import { as, makeUser } from "@/test/fixtures";
import { createOrganization, updateOrganization } from "./service";

const { db, close } = createTestDb();
afterAll(close);
beforeEach(() => resetDatabase(db));

const team = (name: string, extra: Record<string, unknown> = {}) => ({
	name,
	shortName: name.slice(0, 3),
	...extra,
});

describe("organisations", () => {
	it("creator becomes org admin; slug must be unique; changes are audited", async () => {
		const alice = await makeUser(db, "Alice");
		const org = await createOrganization(await as(db, alice), {
			name: "Metro League",
			slug: "Metro",
		});
		expect(org.slug).toBe("metro");
		const roles = await db
			.select()
			.from(schema.roleAssignments)
			.where(eq(schema.roleAssignments.userId, alice));
		expect(roles).toMatchObject([
			{ role: "ORG_ADMIN", scopeType: "ORGANIZATION", scopeId: org.id },
		]);
		await expect(
			createOrganization(await as(db, alice), { name: "Other", slug: "metro" }),
		).rejects.toMatchObject({
			code: "CONFLICT",
			fieldErrors: { slug: "That address is already taken" },
		});
		await updateOrganization(await as(db, alice), org.id, { name: "Metro Cricket League" });
		const log = await db
			.select()
			.from(schema.auditLog)
			.where(eq(schema.auditLog.resourceId, org.id));
		expect(log.map((l) => l.action)).toEqual(["organization.create", "organization.update"]);
		expect(log[1]).toMatchObject({
			before: { name: "Metro League" },
			after: { name: "Metro Cricket League" },
			actorId: alice,
		});
	});

	it("rejects reserved or malformed addresses", async () => {
		const alice = await as(db, await makeUser(db));
		for (const slug of ["www", "ab", "-bad-", "has space"]) {
			await expect(createOrganization(alice, { name: "League", slug })).rejects.toBeInstanceOf(
				ServiceError,
			);
		}
	});

	it("tenant isolation: an org admin cannot change another organisation", async () => {
		const alice = await makeUser(db);
		const bob = await makeUser(db);
		const a = await createOrganization(await as(db, alice), { name: "League A", slug: "league-a" });
		await createOrganization(await as(db, bob), { name: "League B", slug: "league-b" });
		await expect(
			updateOrganization(await as(db, bob), a.id, { name: "Hijacked" }),
		).rejects.toBeInstanceOf(Forbidden);
		await expect(
			updateOrganization(await as(db, null), a.id, { name: "Anon" }),
		).rejects.toBeInstanceOf(Forbidden);
		await expect(
			updateOrganization(await as(db, bob), "00000000-0000-7000-8000-000000000000", {
				name: "Xyz",
			}),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});

describe("clubs and teams", () => {
	it("anyone signed in can create a club (and becomes its admin) but not anonymously", async () => {
		const alice = await makeUser(db);
		const club = await createClub(await as(db, alice), { name: "Riverside CC" });
		expect(club.slug).toBe("riverside-cc");
		const again = await createClub(await as(db, alice), { name: "Riverside CC" });
		expect(again.slug).toBe("riverside-cc-2");
		await expect(createClub(await as(db, null), { name: "Nope" })).rejects.toBeInstanceOf(
			Forbidden,
		);
		await expect(createClub(await as(db, alice), { name: "X" })).rejects.toMatchObject({
			code: "INVALID",
		});
	});

	it("only club admins add teams to their club; standalone teams are open to everyone", async () => {
		const owner = await makeUser(db);
		const stranger = await makeUser(db);
		const club = await createClub(await as(db, owner), { name: "Riverside CC" });
		await expect(
			createTeam(await as(db, stranger), team("First XI", { clubId: club.id })),
		).rejects.toBeInstanceOf(Forbidden);
		const first = await createTeam(await as(db, owner), team("First XI", { clubId: club.id }));
		expect(first.clubId).toBe(club.id);
		const pickup = await createTeam(await as(db, stranger), team("Sunday Strollers"));
		expect(pickup.clubId).toBeNull();
		await expect(
			createTeam(
				await as(db, owner),
				team("Ghost", { clubId: "00000000-0000-7000-8000-000000000000" }),
			),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("tenant isolation: club admins and team managers only manage their own teams", async () => {
		const a = await makeUser(db);
		const b = await makeUser(db);
		const clubA = await createClub(await as(db, a), { name: "Club A" });
		const clubB = await createClub(await as(db, b), { name: "Club B" });
		const teamA = await createTeam(await as(db, a), team("Alphas", { clubId: clubA.id }));
		const teamB = await createTeam(await as(db, b), team("Betas", { clubId: clubB.id }));
		await updateTeam(await as(db, a), teamA.id, team("Alpha Strikers", { category: "SENIOR" }));
		await expect(updateTeam(await as(db, a), teamB.id, team("Mine now"))).rejects.toBeInstanceOf(
			Forbidden,
		);
		await expect(
			updateClub(await as(db, a), clubB.id, { name: "Mine now" }),
		).rejects.toBeInstanceOf(Forbidden);

		// A team manager (not club admin) of a standalone team cannot touch another team.
		const c = await makeUser(db);
		const solo = await createTeam(await as(db, c), team("Solos"));
		await updateTeam(await as(db, c), solo.id, team("Solo Stars"));
		await expect(updateTeam(await as(db, c), teamA.id, team("Nope"))).rejects.toBeInstanceOf(
			Forbidden,
		);
		const [renamed] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamA.id));
		expect(renamed).toMatchObject({ name: "Alpha Strikers", shortName: "ALP" });
	});

	it("validates team short names", async () => {
		const ctx = await as(db, await makeUser(db));
		await expect(createTeam(ctx, { name: "Tigers", shortName: "TOOLONG" })).rejects.toMatchObject({
			code: "INVALID",
			fieldErrors: { shortName: "1–6 letters or digits" },
		});
	});
});

describe("venues", () => {
	it("public venues are open to everyone; organisation venues to its admins only", async () => {
		const admin = await makeUser(db);
		const other = await makeUser(db);
		const org = await createOrganization(await as(db, admin), { name: "League", slug: "league" });
		await createVenue(await as(db, other), { name: "Victoria Park" });
		await expect(
			createVenue(await as(db, other), { name: "League Ground", organizationId: org.id }),
		).rejects.toBeInstanceOf(Forbidden);
		const v = await createVenue(await as(db, admin), {
			name: "League Ground",
			organizationId: org.id,
		});
		const [row] = await db.select().from(schema.venues).where(eq(schema.venues.id, v.id));
		expect(row).toMatchObject({ organizationId: org.id, createdBy: admin });
	});
});
