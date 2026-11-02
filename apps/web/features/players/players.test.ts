/** Integration tests (real Postgres): player profiles, squads, captaincy roles and claims. */
import { can, Forbidden } from "@cricket/authz";
import { schema } from "@cricket/db";
import { createTestDb, resetDatabase } from "@cricket/db/testing";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClub } from "@/features/clubs/service";
import { createTeam } from "@/features/teams/service";
import { as, makeUser } from "@/test/fixtures";
import {
	addSquadPlayer,
	createOwnProfile,
	decideClaim,
	playerResource,
	removeSquadPlayer,
	requestClaim,
	setSquadRole,
	updatePlayer,
} from "./service";

const { db, close } = createTestDb();
afterAll(close);
beforeEach(() => resetDatabase(db));

async function teamWithManager() {
	const manager = await makeUser(db, "Manager");
	const club = await createClub(await as(db, manager), { name: "Riverside" });
	const team = await createTeam(await as(db, manager), {
		name: "First XI",
		shortName: "FX",
		clubId: club.id,
	});
	return { manager, club, team };
}

const rolesOf = (userId: string) =>
	db
		.select({ role: schema.roleAssignments.role, scopeId: schema.roleAssignments.scopeId })
		.from(schema.roleAssignments)
		.where(
			and(eq(schema.roleAssignments.userId, userId), eq(schema.roleAssignments.scopeType, "TEAM")),
		);

describe("player profiles", () => {
	it("a user creates one own profile and can edit it; others cannot", async () => {
		const sam = await makeUser(db, "Sam");
		const p = await createOwnProfile(await as(db, sam), {
			displayName: "Sam Curran",
			battingHand: "LEFT",
			role: "ALL_ROUNDER",
		});
		expect(p.slug).toBe("sam-curran");
		await expect(
			createOwnProfile(await as(db, sam), { displayName: "Sam Again" }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await updatePlayer(await as(db, sam), p.id, {
			displayName: "Sam Curran",
			bowlingStyle: "LEFT_ARM_MEDIUM_FAST",
		});
		const other = await makeUser(db);
		await expect(
			updatePlayer(await as(db, other), p.id, { displayName: "Hacked" }),
		).rejects.toBeInstanceOf(Forbidden);
		await expect(
			createOwnProfile(await as(db, null), { displayName: "Anon" }),
		).rejects.toBeInstanceOf(Forbidden);
	});

	it("validates dates of birth and records guardian consent changes", async () => {
		const parent = await makeUser(db, "Parent");
		await expect(
			createOwnProfile(await as(db, parent), { displayName: "Kid", dateOfBirth: "31/12/2012" }),
		).rejects.toMatchObject({
			code: "INVALID",
		});
		const kid = await createOwnProfile(await as(db, parent), {
			displayName: "Kid Young",
			dateOfBirth: "2013-04-01",
			guardianConsent: "on",
		});
		let rows = await db.select().from(schema.consents).where(eq(schema.consents.playerId, kid.id));
		expect(rows).toHaveLength(1);
		await updatePlayer(await as(db, parent), kid.id, {
			displayName: "Kid Young",
			dateOfBirth: "2013-04-01",
		});
		rows = await db.select().from(schema.consents).where(eq(schema.consents.playerId, kid.id));
		expect(rows[0]!.revokedAt).not.toBeNull();
	});
});

describe("squads", () => {
	it("team staff add new (unclaimed) and existing players; duplicates are rejected", async () => {
		const { manager, team } = await teamWithManager();
		const ctx = await as(db, manager);
		const added = await addSquadPlayer(ctx, team.id, { displayName: "Joe Root" });
		await expect(addSquadPlayer(ctx, team.id, { playerId: added.playerId })).rejects.toMatchObject({
			code: "CONFLICT",
		});
		const stranger = await makeUser(db);
		await expect(
			addSquadPlayer(await as(db, stranger), team.id, { displayName: "Nope" }),
		).rejects.toBeInstanceOf(Forbidden);
		await expect(
			addSquadPlayer(ctx, team.id, { playerId: "00000000-0000-7000-8000-000000000000" }),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await removeSquadPlayer(ctx, team.id, added.playerId);
		await expect(removeSquadPlayer(ctx, team.id, added.playerId)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await addSquadPlayer(ctx, team.id, { playerId: added.playerId }); // can rejoin
	});

	it("claimed players get team roles; one captain at a time, and the captain may manage the squad", async () => {
		const { manager, team } = await teamWithManager();
		const ctx = await as(db, manager);
		const alice = await makeUser(db, "Alice");
		const bob = await makeUser(db, "Bob");
		const pa = await createOwnProfile(await as(db, alice), { displayName: "Alice A" });
		const pb = await createOwnProfile(await as(db, bob), { displayName: "Bob B" });
		await addSquadPlayer(ctx, team.id, { playerId: pa.id, squadRole: "CAPTAIN" });
		await addSquadPlayer(ctx, team.id, { playerId: pb.id });
		expect(await rolesOf(alice)).toEqual(
			expect.arrayContaining([
				{ role: "PLAYER", scopeId: team.id },
				{ role: "CAPTAIN", scopeId: team.id },
			]),
		);

		// The captain can manage the squad...
		await addSquadPlayer(await as(db, alice), team.id, { displayName: "New Kid" });
		// ...and handing the captaincy to Bob demotes Alice.
		await setSquadRole(ctx, team.id, pb.id, { squadRole: "CAPTAIN" });
		expect(await rolesOf(alice)).toEqual([{ role: "PLAYER", scopeId: team.id }]);
		expect((await rolesOf(bob)).map((r) => r.role).sort()).toEqual(["CAPTAIN", "PLAYER"]);
		await expect(
			addSquadPlayer(await as(db, alice), team.id, { displayName: "Blocked" }),
		).rejects.toBeInstanceOf(Forbidden);

		// Leaving the squad removes the team roles; the manager keeps theirs.
		await removeSquadPlayer(ctx, team.id, pb.id);
		expect(await rolesOf(bob)).toEqual([]);
		expect((await rolesOf(manager)).map((r) => r.role)).toEqual(["TEAM_MANAGER"]);
		await expect(setSquadRole(ctx, team.id, pb.id, { squadRole: "PLAYER" })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("teammates may see each other's private details; strangers may not", async () => {
		const { manager, team } = await teamWithManager();
		const ctx = await as(db, manager);
		const mate = await makeUser(db);
		const pm = await createOwnProfile(await as(db, mate), { displayName: "Mate" });
		await addSquadPlayer(ctx, team.id, { playerId: pm.id });
		const kid = await addSquadPlayer(ctx, team.id, { displayName: "Young Kid" });
		const resource = await playerResource(db, kid.playerId);
		expect(can((await as(db, mate)).subject, "player.viewPrivate", resource)).toBe(true);
		expect(can((await as(db, manager)).subject, "player.viewPrivate", resource)).toBe(true);
		expect(can((await as(db, await makeUser(db))).subject, "player.viewPrivate", resource)).toBe(
			false,
		);
	});
});

describe("claims", () => {
	it("a user claims an unclaimed profile and the team manager approves it", async () => {
		const { manager, team } = await teamWithManager();
		const { playerId } = await addSquadPlayer(await as(db, manager), team.id, {
			displayName: "Jos Buttler",
		});
		const jos = await makeUser(db, "Jos");
		const rival = await makeUser(db, "Rival");
		const claim = await requestClaim(await as(db, jos), playerId, { message: "That's me" });
		await expect(requestClaim(await as(db, jos), playerId, {})).rejects.toMatchObject({
			code: "CONFLICT",
		});
		const rivalClaim = await requestClaim(await as(db, rival), playerId, {});

		await expect(decideClaim(await as(db, jos), claim.id, true)).rejects.toBeInstanceOf(Forbidden);
		await decideClaim(await as(db, manager), claim.id, true);

		const [player] = await db.select().from(schema.players).where(eq(schema.players.id, playerId));
		expect(player!.userId).toBe(jos);
		expect(await rolesOf(jos)).toEqual([{ role: "PLAYER", scopeId: team.id }]);
		const [r] = await db
			.select()
			.from(schema.playerClaims)
			.where(eq(schema.playerClaims.id, rivalClaim.id));
		expect(r!.status).toBe("REJECTED");
		await expect(decideClaim(await as(db, manager), rivalClaim.id, true)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		// A claimed profile cannot be claimed again.
		await expect(
			requestClaim(await as(db, await makeUser(db)), playerId, {}),
		).rejects.toBeInstanceOf(Forbidden);
		// The new owner can now edit it.
		await updatePlayer(await as(db, jos), playerId, {
			displayName: "Jos Buttler",
			role: "WICKET_KEEPER",
		});
	});

	it("users with a profile cannot claim another; rejected claims change nothing", async () => {
		const { manager, team } = await teamWithManager();
		const { playerId } = await addSquadPlayer(await as(db, manager), team.id, {
			displayName: "Ben Stokes",
		});
		const has = await makeUser(db);
		await createOwnProfile(await as(db, has), { displayName: "Has Profile" });
		await expect(requestClaim(await as(db, has), playerId, {})).rejects.toMatchObject({
			code: "CONFLICT",
		});
		const ben = await makeUser(db);
		const claim = await requestClaim(await as(db, ben), playerId, {});
		await decideClaim(await as(db, manager), claim.id, false);
		const [player] = await db.select().from(schema.players).where(eq(schema.players.id, playerId));
		expect(player!.userId).toBeNull();
	});

	it("approval fails if the claimant created their own profile meanwhile", async () => {
		const { manager, team } = await teamWithManager();
		const { playerId } = await addSquadPlayer(await as(db, manager), team.id, {
			displayName: "Jofra Archer",
		});
		const jofra = await makeUser(db);
		const claim = await requestClaim(await as(db, jofra), playerId, {});
		await createOwnProfile(await as(db, jofra), { displayName: "Jofra" });
		await expect(decideClaim(await as(db, manager), claim.id, true)).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});
});
