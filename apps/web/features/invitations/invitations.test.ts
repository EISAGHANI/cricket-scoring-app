/** Integration tests (real Postgres): invitations and join requests. */
import { Forbidden } from "@cricket/authz";
import { schema } from "@cricket/db";
import { createTestDb, resetDatabase } from "@cricket/db/testing";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addSquadPlayer, createOwnProfile } from "@/features/players/service";
import { createTeam } from "@/features/teams/service";
import { hashToken } from "@/lib/services/tokens";
import { as, makeUser } from "@/test/fixtures";
import {
	acceptInvitation,
	createInvitation,
	decideJoinRequest,
	findInvitation,
	requestToJoin,
	revokeInvitation,
} from "./service";

const { db, close } = createTestDb();
afterAll(close);
beforeEach(() => resetDatabase(db));

async function setup() {
	const manager = await makeUser(db, "Manager");
	const team = await createTeam(await as(db, manager), { name: "Invitees", shortName: "INV" });
	return { manager, team };
}

async function userWith(email: string, name = "Invited Person", phoneNumber: string | null = null) {
	const [u] = await db
		.insert(schema.users)
		.values({ name, email, emailVerified: true, phoneNumber })
		.returning({ id: schema.users.id });
	return u!.id;
}

const squadOf = (teamId: string) =>
	db
		.select({
			playerId: schema.teamPlayers.playerId,
			squadRole: schema.teamPlayers.squadRole,
			userId: schema.players.userId,
		})
		.from(schema.teamPlayers)
		.innerJoin(schema.players, eq(schema.players.id, schema.teamPlayers.playerId))
		.where(and(eq(schema.teamPlayers.teamId, teamId), isNull(schema.teamPlayers.leftAt)));

describe("invitations", () => {
	it("stores only a hash; the matching user accepts and joins the squad with a new profile", async () => {
		const { manager, team } = await setup();
		const inv = await createInvitation(await as(db, manager), team.id, {
			email: "New.Player@Example.com",
			squadRole: "VICE_CAPTAIN",
		});
		const [row] = await db
			.select()
			.from(schema.invitations)
			.where(eq(schema.invitations.id, inv.id));
		expect(row!.tokenHash).toBe(hashToken(inv.token));
		expect(JSON.stringify(row)).not.toContain(inv.token);
		expect(row!.email).toBe("new.player@example.com");

		const invited = await userWith("new.player@example.com", "Nat Sciver");
		const accepted = await acceptInvitation(await as(db, invited), inv.token);
		expect(await squadOf(team.id)).toEqual([
			{ playerId: accepted.playerId, squadRole: "VICE_CAPTAIN", userId: invited },
		]);
		const [player] = await db
			.select()
			.from(schema.players)
			.where(eq(schema.players.id, accepted.playerId));
		expect(player!.displayName).toBe("Nat Sciver");
		await expect(acceptInvitation(await as(db, invited), inv.token)).rejects.toMatchObject({
			message: "This invitation is accepted",
		});
	});

	it("a forwarded link cannot be used by someone else", async () => {
		const { manager, team } = await setup();
		const inv = await createInvitation(await as(db, manager), team.id, {
			email: "right@example.com",
		});
		const wrong = await userWith("wrong@example.com");
		await expect(acceptInvitation(await as(db, wrong), inv.token)).rejects.toMatchObject({
			code: "CONFLICT",
		});
		await expect(acceptInvitation(await as(db, null), inv.token)).rejects.toMatchObject({
			code: "INVALID",
		});
		await expect(acceptInvitation(await as(db, wrong), "not-a-token")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("phone invitations match the user's verified number; expiry and revocation are enforced", async () => {
		const { manager, team } = await setup();
		const ctx = await as(db, manager);
		const inv = await createInvitation(
			ctx,
			team.id,
			{ phoneNumber: "+44 7700 900123" },
			new Date("2026-01-01"),
		);
		expect(inv.phoneNumber).toBe("+447700900123");
		const phoneUser = await userWith("447700900123@phone.cricket.invalid", "", "+447700900123");
		expect((await findInvitation(db, inv.token, new Date("2026-02-01")))?.state).toBe("EXPIRED");
		await expect(
			acceptInvitation(await as(db, phoneUser), inv.token, new Date("2026-02-01")),
		).rejects.toMatchObject({
			message: "This invitation is expired",
		});
		const fresh = await createInvitation(ctx, team.id, { phoneNumber: "+447700900123" });
		await revokeInvitation(ctx, fresh.id);
		await expect(revokeInvitation(ctx, fresh.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(acceptInvitation(await as(db, phoneUser), fresh.token)).rejects.toMatchObject({
			message: "This invitation is revoked",
		});
		const third = await createInvitation(ctx, team.id, { phoneNumber: "+447700900123" });
		const accepted = await acceptInvitation(await as(db, phoneUser), third.token);
		const [player] = await db
			.select()
			.from(schema.players)
			.where(eq(schema.players.id, accepted.playerId));
		expect(player!.displayName).toBe("New player"); // phone-only account with no name yet
	});

	it("an invitation can hand an unclaimed squad profile to the invitee", async () => {
		const { manager, team } = await setup();
		const ctx = await as(db, manager);
		const { playerId } = await addSquadPlayer(ctx, team.id, { displayName: "Tammy Beaumont" });
		const inv = await createInvitation(ctx, team.id, { email: "tammy@example.com", playerId });
		const tammy = await userWith("tammy@example.com");
		const accepted = await acceptInvitation(await as(db, tammy), inv.token);
		expect(accepted.playerId).toBe(playerId);
		expect(await squadOf(team.id)).toEqual([{ playerId, squadRole: "PLAYER", userId: tammy }]);
		await expect(
			createInvitation(ctx, team.id, { email: "x@example.com", playerId }),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("users with a profile join with it; only team staff can invite; input is validated", async () => {
		const { manager, team } = await setup();
		const pro = await userWith("pro@example.com");
		const own = await createOwnProfile(await as(db, pro), { displayName: "Pro Player" });
		const inv = await createInvitation(await as(db, manager), team.id, {
			email: "pro@example.com",
		});
		expect((await acceptInvitation(await as(db, pro), inv.token)).playerId).toBe(own.id);
		const stranger = await makeUser(db);
		await expect(
			createInvitation(await as(db, stranger), team.id, { email: "a@example.com" }),
		).rejects.toBeInstanceOf(Forbidden);
		const ctx = await as(db, manager);
		await expect(createInvitation(ctx, team.id, {})).rejects.toMatchObject({ code: "INVALID" });
		await expect(
			createInvitation(ctx, team.id, { email: "a@example.com", phoneNumber: "+447700900123" }),
		).rejects.toMatchObject({ code: "INVALID" });
		await expect(
			createInvitation(ctx, team.id, { phoneNumber: "07700 900123" }),
		).rejects.toMatchObject({ code: "INVALID" });
	});
});

describe("join requests", () => {
	it("a user asks to join; staff approve; the user joins with a profile", async () => {
		const { manager, team } = await setup();
		const fan = await userWith("fan@example.com", "Keen Fan");
		const req = await requestToJoin(await as(db, fan), team.id, { message: "I bowl leg-spin" });
		await expect(requestToJoin(await as(db, fan), team.id, {})).rejects.toMatchObject({
			code: "CONFLICT",
		});
		await expect(decideJoinRequest(await as(db, fan), req.id, true)).rejects.toBeInstanceOf(
			Forbidden,
		);
		const decided = await decideJoinRequest(await as(db, manager), req.id, true);
		expect(await squadOf(team.id)).toEqual([
			{ playerId: decided.playerId, squadRole: "PLAYER", userId: fan },
		]);
		await expect(requestToJoin(await as(db, fan), team.id, {})).rejects.toMatchObject({
			message: "You're already in this squad",
		});
		await expect(decideJoinRequest(await as(db, manager), req.id, true)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("rejected requests add nobody; anonymous users cannot ask", async () => {
		const { manager, team } = await setup();
		const fan = await userWith("fan2@example.com");
		const req = await requestToJoin(await as(db, fan), team.id, {});
		await decideJoinRequest(await as(db, manager), req.id, false);
		expect(await squadOf(team.id)).toEqual([]);
		await expect(requestToJoin(await as(db, null), team.id, {})).rejects.toBeInstanceOf(Forbidden);
	});
});
