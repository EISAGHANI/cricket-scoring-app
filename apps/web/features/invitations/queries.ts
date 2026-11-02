import "server-only";
import { schema } from "@cricket/db";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/lib/db";

const { invitations, joinRequests, users, players, teamPlayers } = schema;

/** Pending, unexpired invitations for a team (for its staff; request-time). */
export async function pendingInvitations(teamId: string) {
	await connection();
	return db
		.select({
			id: invitations.id,
			email: invitations.email,
			phoneNumber: invitations.phoneNumber,
			expiresAt: invitations.expiresAt,
		})
		.from(invitations)
		.where(
			and(
				eq(invitations.teamId, teamId),
				eq(invitations.status, "PENDING"),
				gt(invitations.expiresAt, new Date()),
			),
		)
		.orderBy(asc(invitations.createdAt));
}

export async function pendingJoinRequests(teamId: string) {
	return db
		.select({
			id: joinRequests.id,
			message: joinRequests.message,
			name: users.name,
			email: users.email,
		})
		.from(joinRequests)
		.innerJoin(users, eq(users.id, joinRequests.userId))
		.where(and(eq(joinRequests.teamId, teamId), eq(joinRequests.status, "PENDING")))
		.orderBy(asc(joinRequests.createdAt));
}

/** The viewer's relationship with a team: member, request pending, or neither. */
export async function membershipOf(
	teamId: string,
	userId: string,
): Promise<"member" | "pending" | "none"> {
	const [member] = await db
		.select({ id: teamPlayers.id })
		.from(teamPlayers)
		.innerJoin(players, eq(players.id, teamPlayers.playerId))
		.where(
			and(eq(teamPlayers.teamId, teamId), eq(players.userId, userId), isNull(teamPlayers.leftAt)),
		);
	if (member !== undefined) return "member";
	const [pending] = await db
		.select({ id: joinRequests.id })
		.from(joinRequests)
		.where(
			and(
				eq(joinRequests.teamId, teamId),
				eq(joinRequests.userId, userId),
				eq(joinRequests.status, "PENDING"),
			),
		);
	return pending === undefined ? "none" : "pending";
}
