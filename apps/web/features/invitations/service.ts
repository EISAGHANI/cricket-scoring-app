/**
 * Team invitations (by email or phone) and join requests (M6). Tokens are 256-bit secrets; only
 * their SHA-256 hash is stored. Accepting requires the signed-in user's email or phone to match.
 */
import { authorize, type Resource } from "@cricket/authz";
import { schema, type Executor } from "@cricket/db";
import { and, eq, isNull } from "drizzle-orm";
import { addToSquadInTx, ensureOwnPlayer } from "@/features/players/service";
import { audit } from "@/lib/services/audit";
import type { ServiceContext } from "@/lib/services/context";
import { conflict, notFound, ServiceError } from "@/lib/services/errors";
import { parse } from "@/lib/services/result";
import { generateToken, hashToken } from "@/lib/services/tokens";
import { INVITATION_TTL_DAYS, InvitationInput, JoinRequestInput } from "./schemas";

const { invitations, joinRequests, teams, users, players, teamPlayers } = schema;

async function teamResource(
	tx: Executor,
	teamId: string,
): Promise<Extract<Resource, { type: "team" }> & { name: string }> {
	const [team] = await tx
		.select({ id: teams.id, clubId: teams.clubId, name: teams.name })
		.from(teams)
		.where(and(eq(teams.id, teamId), isNull(teams.deletedAt)));
	if (team === undefined) throw notFound("Team");
	return { type: "team", id: team.id, clubId: team.clubId, name: team.name };
}

/** A name for a new profile: the user's name, else their email's local part — never a phone number. */
function fallbackName(user: { name: string; email: string }): string {
	if (user.name.trim() !== "") return user.name;
	return user.email.endsWith("@phone.cricket.invalid") ? "" : (user.email.split("@")[0] ?? "");
}

export interface CreatedInvitation {
	id: string;
	/** Returned once so the caller can send it; never stored in clear. */
	token: string;
	email: string | null;
	phoneNumber: string | null;
	teamName: string;
}

export async function createInvitation(
	ctx: ServiceContext,
	teamId: string,
	raw: unknown,
	now = new Date(),
): Promise<CreatedInvitation> {
	const input = parse(InvitationInput, raw);
	return ctx.db.transaction(async (tx) => {
		const team = await teamResource(tx, teamId);
		authorize(ctx.subject, "team.invite", team);
		const subject = ctx.subject;
		if (input.playerId !== undefined) {
			const [member] = await tx
				.select({ userId: players.userId })
				.from(teamPlayers)
				.innerJoin(players, eq(players.id, teamPlayers.playerId))
				.where(
					and(
						eq(teamPlayers.teamId, teamId),
						eq(teamPlayers.playerId, input.playerId),
						isNull(teamPlayers.leftAt),
					),
				);
			if (member === undefined) throw notFound("Squad member");
			if (member.userId !== null) throw conflict("That player already has an account", "playerId");
		}
		const token = generateToken();
		const [row] = await tx
			.insert(invitations)
			.values({
				teamId,
				email: input.email ?? null,
				phoneNumber: input.phoneNumber ?? null,
				playerId: input.playerId ?? null,
				squadRole: input.squadRole,
				tokenHash: hashToken(token),
				expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
				invitedBy: subject.userId,
			})
			.returning({ id: invitations.id });
		await audit(tx, {
			actorId: subject.userId,
			action: "team.invite",
			resourceType: "team",
			resourceId: teamId,
			after: {
				invitationId: row!.id,
				email: input.email ?? null,
				phoneNumber: input.phoneNumber ?? null,
				squadRole: input.squadRole,
			},
			ip: ctx.ip ?? null,
		});
		return {
			id: row!.id,
			token,
			email: input.email ?? null,
			phoneNumber: input.phoneNumber ?? null,
			teamName: team.name,
		};
	});
}

export type InvitationState = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export async function findInvitation(tx: Executor, token: string, now = new Date()) {
	const [row] = await tx
		.select({
			id: invitations.id,
			teamId: invitations.teamId,
			teamName: teams.name,
			teamSlug: teams.slug,
			email: invitations.email,
			phoneNumber: invitations.phoneNumber,
			playerId: invitations.playerId,
			squadRole: invitations.squadRole,
			status: invitations.status,
			expiresAt: invitations.expiresAt,
			invitedBy: invitations.invitedBy,
		})
		.from(invitations)
		.innerJoin(teams, eq(teams.id, invitations.teamId))
		.where(eq(invitations.tokenHash, hashToken(token)));
	if (row === undefined) return null;
	const state: InvitationState =
		row.status === "PENDING" && row.expiresAt <= now ? "EXPIRED" : row.status;
	return { ...row, state };
}

export async function acceptInvitation(ctx: ServiceContext, token: string, now = new Date()) {
	if (ctx.subject === null) throw new ServiceError("INVALID", "Sign in to accept the invitation");
	const subject = ctx.subject;
	return ctx.db.transaction(async (tx) => {
		const inv = await findInvitation(tx, token, now);
		if (inv === null) throw notFound("Invitation");
		if (inv.state !== "PENDING")
			throw new ServiceError("CONFLICT", `This invitation is ${inv.state.toLowerCase()}`);
		const [user] = await tx
			.select({ name: users.name, email: users.email, phoneNumber: users.phoneNumber })
			.from(users)
			.where(eq(users.id, subject.userId));
		const me = user!;
		const matches =
			(inv.email !== null && inv.email.toLowerCase() === me.email.toLowerCase()) ||
			(inv.phoneNumber !== null && inv.phoneNumber === me.phoneNumber);
		if (!matches) {
			throw new ServiceError(
				"CONFLICT",
				`This invitation was sent to ${inv.email ?? inv.phoneNumber}. Sign in with that account to accept it.`,
			);
		}
		const playerId = await ensureOwnPlayer(tx, subject.userId, fallbackName(me), inv.playerId);
		await addToSquadInTx(tx, inv.teamId, playerId, inv.squadRole, inv.invitedBy ?? subject.userId);
		await tx
			.update(invitations)
			.set({ status: "ACCEPTED", acceptedBy: subject.userId, acceptedAt: now })
			.where(eq(invitations.id, inv.id));
		await audit(tx, {
			actorId: subject.userId,
			action: "team.invitation.accept",
			resourceType: "team",
			resourceId: inv.teamId,
			after: { invitationId: inv.id, playerId },
			ip: ctx.ip ?? null,
		});
		return { teamId: inv.teamId, teamSlug: inv.teamSlug, playerId };
	});
}

export async function revokeInvitation(ctx: ServiceContext, invitationId: string) {
	return ctx.db.transaction(async (tx) => {
		const [inv] = await tx.select().from(invitations).where(eq(invitations.id, invitationId));
		if (inv === undefined || inv.status !== "PENDING") throw notFound("Pending invitation");
		authorize(ctx.subject, "team.invite", await teamResource(tx, inv.teamId));
		await tx.update(invitations).set({ status: "REVOKED" }).where(eq(invitations.id, invitationId));
		await audit(tx, {
			actorId: ctx.subject.userId,
			action: "team.invitation.revoke",
			resourceType: "team",
			resourceId: inv.teamId,
			before: { invitationId },
			ip: ctx.ip ?? null,
		});
		return { teamId: inv.teamId };
	});
}

export async function requestToJoin(ctx: ServiceContext, teamId: string, raw: unknown) {
	const input = parse(JoinRequestInput, raw);
	return ctx.db.transaction(async (tx) => {
		authorize(ctx.subject, "team.requestToJoin", await teamResource(tx, teamId));
		const subject = ctx.subject;
		const [member] = await tx
			.select({ id: teamPlayers.id })
			.from(teamPlayers)
			.innerJoin(players, eq(players.id, teamPlayers.playerId))
			.where(
				and(
					eq(teamPlayers.teamId, teamId),
					eq(players.userId, subject.userId),
					isNull(teamPlayers.leftAt),
				),
			);
		if (member !== undefined) throw conflict("You're already in this squad");
		const [pending] = await tx
			.select({ id: joinRequests.id })
			.from(joinRequests)
			.where(
				and(
					eq(joinRequests.teamId, teamId),
					eq(joinRequests.userId, subject.userId),
					eq(joinRequests.status, "PENDING"),
				),
			);
		if (pending !== undefined) throw conflict("You've already asked to join");
		const [row] = await tx
			.insert(joinRequests)
			.values({ teamId, userId: subject.userId, message: input.message ?? null })
			.returning({ id: joinRequests.id });
		return { id: row!.id };
	});
}

export async function decideJoinRequest(ctx: ServiceContext, requestId: string, approve: boolean) {
	return ctx.db.transaction(async (tx) => {
		const [req] = await tx.select().from(joinRequests).where(eq(joinRequests.id, requestId));
		if (req === undefined || req.status !== "PENDING") throw notFound("Pending request");
		authorize(ctx.subject, "team.decideJoinRequest", await teamResource(tx, req.teamId));
		const subject = ctx.subject;
		let playerId: string | null = null;
		if (approve) {
			const [user] = await tx
				.select({ name: users.name, email: users.email })
				.from(users)
				.where(eq(users.id, req.userId));
			playerId = await ensureOwnPlayer(tx, req.userId, fallbackName(user!));
			await addToSquadInTx(tx, req.teamId, playerId, "PLAYER", subject.userId);
		}
		await tx
			.update(joinRequests)
			.set({
				status: approve ? "APPROVED" : "REJECTED",
				decidedBy: subject.userId,
				decidedAt: new Date(),
			})
			.where(eq(joinRequests.id, requestId));
		await audit(tx, {
			actorId: subject.userId,
			action: approve ? "team.join.approve" : "team.join.reject",
			resourceType: "team",
			resourceId: req.teamId,
			after: { requestId, userId: req.userId, playerId },
			ip: ctx.ip ?? null,
		});
		return { teamId: req.teamId, playerId };
	});
}
