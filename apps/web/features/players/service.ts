import { authorize, type Resource } from "@cricket/authz";
import { schema, type Executor } from "@cricket/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { audit } from "@/lib/services/audit";
import type { ServiceContext } from "@/lib/services/context";
import { conflict, notFound, ServiceError } from "@/lib/services/errors";
import { parse } from "@/lib/services/result";
import { uniqueSlug } from "@/lib/services/slug";
import { AddSquadPlayerInput, ClaimInput, PlayerInput, SquadRoleInput } from "./schemas";

const { players, teams, teamPlayers, roleAssignments, playerClaims, consents } = schema;

/** The authorization resource for a player: owner plus current teams (and their clubs). */
export async function playerResource(
	tx: Executor,
	playerId: string,
): Promise<Extract<Resource, { type: "player" }>> {
	const [player] = await tx
		.select({ id: players.id, userId: players.userId })
		.from(players)
		.where(and(eq(players.id, playerId), isNull(players.deletedAt)));
	if (player === undefined) throw notFound("Player");
	const memberships = await tx
		.select({ teamId: teamPlayers.teamId, clubId: teams.clubId })
		.from(teamPlayers)
		.innerJoin(teams, eq(teams.id, teamPlayers.teamId))
		.where(and(eq(teamPlayers.playerId, playerId), isNull(teamPlayers.leftAt)));
	return { type: "player", id: player.id, userId: player.userId, teams: memberships };
}

async function teamResource(
	tx: Executor,
	teamId: string,
): Promise<Extract<Resource, { type: "team" }>> {
	const [team] = await tx
		.select({ id: teams.id, clubId: teams.clubId })
		.from(teams)
		.where(and(eq(teams.id, teamId), isNull(teams.deletedAt)));
	if (team === undefined) throw notFound("Team");
	return { type: "team", id: team.id, clubId: team.clubId };
}

/**
 * Keep a claimed player's role assignments on a team in line with their squad membership:
 * PLAYER while in the squad, plus CAPTAIN while captain. TEAM_MANAGER is never touched.
 */
async function syncTeamRoles(
	tx: Executor,
	teamId: string,
	playerId: string,
	grantedBy: string,
): Promise<void> {
	const [player] = await tx
		.select({ userId: players.userId })
		.from(players)
		.where(eq(players.id, playerId));
	const userId = player?.userId ?? null;
	if (userId === null) return;
	await tx
		.delete(roleAssignments)
		.where(
			and(
				eq(roleAssignments.userId, userId),
				eq(roleAssignments.scopeType, "TEAM"),
				eq(roleAssignments.scopeId, teamId),
				inArray(roleAssignments.role, ["PLAYER", "CAPTAIN"]),
			),
		);
	const [membership] = await tx
		.select({ squadRole: teamPlayers.squadRole })
		.from(teamPlayers)
		.where(
			and(
				eq(teamPlayers.teamId, teamId),
				eq(teamPlayers.playerId, playerId),
				isNull(teamPlayers.leftAt),
			),
		);
	if (membership === undefined) return;
	const roles =
		membership.squadRole === "CAPTAIN" ? (["PLAYER", "CAPTAIN"] as const) : (["PLAYER"] as const);
	await tx.insert(roleAssignments).values(
		roles.map((role) => ({
			userId,
			role,
			scopeType: "TEAM" as const,
			scopeId: teamId,
			grantedBy,
		})),
	);
}

async function consentChanged(
	tx: Executor,
	playerId: string,
	actorId: string,
	granted: boolean,
): Promise<void> {
	if (granted) {
		await tx.insert(consents).values({ kind: "GUARDIAN", userId: actorId, playerId });
	} else {
		await tx
			.update(consents)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(consents.playerId, playerId),
					eq(consents.kind, "GUARDIAN"),
					isNull(consents.revokedAt),
				),
			);
	}
}

/** A signed-in user creates their own player profile (one per user). */
export async function createOwnProfile(ctx: ServiceContext, raw: unknown) {
	authorize(ctx.subject, "player.create", { type: "player", id: null, userId: null, teams: [] });
	const subject = ctx.subject;
	const input = parse(PlayerInput, raw);
	return ctx.db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: players.id })
			.from(players)
			.where(eq(players.userId, subject.userId));
		if (existing !== undefined) throw conflict("You already have a player profile");
		const slug = await uniqueSlug(tx, players, players.slug, input.displayName);
		const [player] = await tx
			.insert(players)
			.values({ ...input, slug, userId: subject.userId, createdBy: subject.userId })
			.returning({ id: players.id, slug: players.slug });
		const created = player!;
		if (input.guardianConsent) await consentChanged(tx, created.id, subject.userId, true);
		await audit(tx, {
			actorId: subject.userId,
			action: "player.create",
			resourceType: "player",
			resourceId: created.id,
			after: input,
			ip: ctx.ip ?? null,
		});
		return created;
	});
}

export async function updatePlayer(ctx: ServiceContext, playerId: string, raw: unknown) {
	const input = parse(PlayerInput, raw);
	return ctx.db.transaction(async (tx) => {
		authorize(ctx.subject, "player.update", await playerResource(tx, playerId));
		const subject = ctx.subject;
		const [before] = await tx.select().from(players).where(eq(players.id, playerId));
		const prior = before!;
		await tx
			.update(players)
			.set({
				displayName: input.displayName,
				dateOfBirth: input.dateOfBirth ?? null,
				battingHand: input.battingHand ?? null,
				bowlingStyle: input.bowlingStyle ?? null,
				role: input.role ?? null,
				visibility: input.visibility,
				guardianConsent: input.guardianConsent,
			})
			.where(eq(players.id, playerId));
		if (prior.guardianConsent !== input.guardianConsent) {
			await consentChanged(tx, playerId, subject.userId, input.guardianConsent);
		}
		await audit(tx, {
			actorId: subject.userId,
			action: "player.update",
			resourceType: "player",
			resourceId: playerId,
			before: {
				displayName: prior.displayName,
				visibility: prior.visibility,
				guardianConsent: prior.guardianConsent,
			},
			after: input,
			ip: ctx.ip ?? null,
		});
		return { id: playerId, slug: prior.slug };
	});
}

/** Add an existing player, or a new unclaimed one by name, to a team's squad. */
export async function addSquadPlayer(ctx: ServiceContext, teamId: string, raw: unknown) {
	const input = parse(AddSquadPlayerInput, raw);
	return ctx.db.transaction(async (tx) => {
		authorize(ctx.subject, "team.manageSquad", await teamResource(tx, teamId));
		const subject = ctx.subject;
		let playerId: string;
		let slug: string;
		if ("playerId" in input) {
			const [p] = await tx
				.select({ id: players.id, slug: players.slug })
				.from(players)
				.where(and(eq(players.id, input.playerId), isNull(players.deletedAt)));
			if (p === undefined) throw notFound("Player");
			({ id: playerId, slug } = p);
		} else {
			slug = await uniqueSlug(tx, players, players.slug, input.displayName);
			const [p] = await tx
				.insert(players)
				.values({ displayName: input.displayName, slug, createdBy: subject.userId })
				.returning({ id: players.id });
			playerId = p!.id;
		}
		const [already] = await tx
			.select({ id: teamPlayers.id })
			.from(teamPlayers)
			.where(
				and(
					eq(teamPlayers.teamId, teamId),
					eq(teamPlayers.playerId, playerId),
					isNull(teamPlayers.leftAt),
				),
			);
		if (already !== undefined) throw conflict("That player is already in the squad");
		if (input.squadRole === "CAPTAIN") await demoteCaptain(tx, teamId, subject.userId);
		await tx.insert(teamPlayers).values({ teamId, playerId, squadRole: input.squadRole });
		await syncTeamRoles(tx, teamId, playerId, subject.userId);
		await audit(tx, {
			actorId: subject.userId,
			action: "team.squad.add",
			resourceType: "team",
			resourceId: teamId,
			after: { playerId, squadRole: input.squadRole },
			ip: ctx.ip ?? null,
		});
		return { playerId, slug };
	});
}

async function demoteCaptain(tx: Executor, teamId: string, grantedBy: string): Promise<void> {
	const captains = await tx
		.update(teamPlayers)
		.set({ squadRole: "PLAYER" })
		.where(
			and(
				eq(teamPlayers.teamId, teamId),
				eq(teamPlayers.squadRole, "CAPTAIN"),
				isNull(teamPlayers.leftAt),
			),
		)
		.returning({ playerId: teamPlayers.playerId });
	for (const c of captains) await syncTeamRoles(tx, teamId, c.playerId, grantedBy);
}

export async function setSquadRole(
	ctx: ServiceContext,
	teamId: string,
	playerId: string,
	raw: unknown,
) {
	const input = parse(SquadRoleInput, raw);
	return ctx.db.transaction(async (tx) => {
		authorize(ctx.subject, "team.manageSquad", await teamResource(tx, teamId));
		const subject = ctx.subject;
		const where = and(
			eq(teamPlayers.teamId, teamId),
			eq(teamPlayers.playerId, playerId),
			isNull(teamPlayers.leftAt),
		);
		const [membership] = await tx.select().from(teamPlayers).where(where);
		if (membership === undefined) throw notFound("Squad member");
		if (input.squadRole === "CAPTAIN") await demoteCaptain(tx, teamId, subject.userId);
		await tx.update(teamPlayers).set({ squadRole: input.squadRole }).where(where);
		await syncTeamRoles(tx, teamId, playerId, subject.userId);
		await audit(tx, {
			actorId: subject.userId,
			action: "team.squad.role",
			resourceType: "team",
			resourceId: teamId,
			before: { playerId, squadRole: membership.squadRole },
			after: { playerId, squadRole: input.squadRole },
			ip: ctx.ip ?? null,
		});
	});
}

export async function removeSquadPlayer(ctx: ServiceContext, teamId: string, playerId: string) {
	return ctx.db.transaction(async (tx) => {
		authorize(ctx.subject, "team.manageSquad", await teamResource(tx, teamId));
		const subject = ctx.subject;
		const removed = await tx
			.update(teamPlayers)
			.set({ leftAt: new Date() })
			.where(
				and(
					eq(teamPlayers.teamId, teamId),
					eq(teamPlayers.playerId, playerId),
					isNull(teamPlayers.leftAt),
				),
			)
			.returning({ id: teamPlayers.id });
		if (removed.length === 0) throw notFound("Squad member");
		await syncTeamRoles(tx, teamId, playerId, subject.userId);
		await audit(tx, {
			actorId: subject.userId,
			action: "team.squad.remove",
			resourceType: "team",
			resourceId: teamId,
			before: { playerId },
			ip: ctx.ip ?? null,
		});
	});
}

/** A user asks to be recognised as an unclaimed player profile. */
export async function requestClaim(ctx: ServiceContext, playerId: string, raw: unknown) {
	const input = parse(ClaimInput, raw);
	return ctx.db.transaction(async (tx) => {
		authorize(ctx.subject, "player.claim", await playerResource(tx, playerId));
		const subject = ctx.subject;
		const [own] = await tx
			.select({ id: players.id })
			.from(players)
			.where(eq(players.userId, subject.userId));
		if (own !== undefined) throw conflict("You already have a player profile");
		const [pending] = await tx
			.select({ id: playerClaims.id })
			.from(playerClaims)
			.where(
				and(
					eq(playerClaims.playerId, playerId),
					eq(playerClaims.userId, subject.userId),
					eq(playerClaims.status, "PENDING"),
				),
			);
		if (pending !== undefined) throw conflict("You have already asked to claim this profile");
		const [claim] = await tx
			.insert(playerClaims)
			.values({ playerId, userId: subject.userId, message: input.message ?? null })
			.returning({ id: playerClaims.id });
		return { id: claim!.id };
	});
}

/** Team managers (or club admins) of the player's teams approve or reject a claim. */
export async function decideClaim(ctx: ServiceContext, claimId: string, approve: boolean) {
	return ctx.db.transaction(async (tx) => {
		const [claim] = await tx.select().from(playerClaims).where(eq(playerClaims.id, claimId));
		if (claim === undefined || claim.status !== "PENDING") throw notFound("Pending claim");
		const resource = await playerResource(tx, claim.playerId);
		authorize(ctx.subject, "player.decideClaim", resource);
		const subject = ctx.subject;
		if (approve) {
			if (resource.userId !== null)
				throw new ServiceError("CONFLICT", "This profile has already been claimed");
			const [own] = await tx
				.select({ id: players.id })
				.from(players)
				.where(eq(players.userId, claim.userId));
			if (own !== undefined)
				throw new ServiceError("CONFLICT", "That user already has a player profile");
			await tx.update(players).set({ userId: claim.userId }).where(eq(players.id, claim.playerId));
			for (const t of resource.teams)
				await syncTeamRoles(tx, t.teamId, claim.playerId, subject.userId);
			// Other pending claims on this profile can no longer succeed.
			await tx
				.update(playerClaims)
				.set({ status: "REJECTED", decidedBy: subject.userId, decidedAt: new Date() })
				.where(and(eq(playerClaims.playerId, claim.playerId), eq(playerClaims.status, "PENDING")));
		}
		await tx
			.update(playerClaims)
			.set({
				status: approve ? "APPROVED" : "REJECTED",
				decidedBy: subject.userId,
				decidedAt: new Date(),
			})
			.where(eq(playerClaims.id, claimId));
		await audit(tx, {
			actorId: subject.userId,
			action: approve ? "player.claim.approve" : "player.claim.reject",
			resourceType: "player",
			resourceId: claim.playerId,
			after: { claimId, userId: claim.userId },
			ip: ctx.ip ?? null,
		});
		return { playerId: claim.playerId };
	});
}
