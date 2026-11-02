import "server-only";
import { schema } from "@cricket/db";
import { and, asc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { containsPattern } from "@/lib/services/like";

const { players, teams, teamPlayers, playerClaims, users } = schema;

export const playerTags = {
	list: "players",
	one: (id: string) => `player:${id}`,
	slug: (slug: string) => `player-slug:${slug.toLowerCase()}`,
	squad: (teamId: string) => `team-squad:${teamId}`,
};

/** Today's date (YYYY-MM-DD) at request time, for age-based privacy rules. */
export async function todayIso(): Promise<string> {
	await connection();
	return new Date().toISOString().slice(0, 10);
}

const profileColumns = {
	id: players.id,
	slug: players.slug,
	displayName: players.displayName,
	dateOfBirth: players.dateOfBirth,
	battingHand: players.battingHand,
	bowlingStyle: players.bowlingStyle,
	role: players.role,
	visibility: players.visibility,
	guardianConsent: players.guardianConsent,
	userId: players.userId,
};

export type PlayerProfile = {
	id: string;
	slug: string;
	displayName: string;
	dateOfBirth: string | null;
	battingHand: "RIGHT" | "LEFT" | null;
	bowlingStyle: string | null;
	role: "BATTER" | "BOWLER" | "ALL_ROUNDER" | "WICKET_KEEPER" | null;
	visibility: "PUBLIC" | "PRIVATE_TO_TEAM";
	guardianConsent: boolean;
	userId: string | null;
	teams: { teamId: string; slug: string; name: string; clubId: string | null; squadRole: string }[];
};

export async function getPlayerBySlug(slug: string): Promise<PlayerProfile | null> {
	"use cache";
	cacheTag(playerTags.slug(slug));
	const [player] = await db
		.select(profileColumns)
		.from(players)
		.where(and(eq(players.slug, slug), isNull(players.deletedAt)));
	if (player === undefined) return null;
	cacheTag(playerTags.one(player.id));
	const memberships = await db
		.select({
			teamId: teams.id,
			slug: teams.slug,
			name: teams.name,
			clubId: teams.clubId,
			squadRole: teamPlayers.squadRole,
		})
		.from(teamPlayers)
		.innerJoin(teams, eq(teams.id, teamPlayers.teamId))
		.where(
			and(eq(teamPlayers.playerId, player.id), isNull(teamPlayers.leftAt), isNull(teams.deletedAt)),
		)
		.orderBy(asc(teams.name));
	return { ...player, teams: memberships };
}

export async function getOwnPlayerSlug(userId: string): Promise<string | null> {
	const [p] = await db
		.select({ slug: players.slug })
		.from(players)
		.where(and(eq(players.userId, userId), isNull(players.deletedAt)));
	return p?.slug ?? null;
}

export type PlayerListItem = Omit<PlayerProfile, "teams" | "battingHand" | "bowlingStyle">;

export async function listPlayers(q: string | null): Promise<PlayerListItem[]> {
	"use cache";
	cacheTag(playerTags.list);
	const where =
		q === null || q === ""
			? isNull(players.deletedAt)
			: and(isNull(players.deletedAt), ilike(players.displayName, containsPattern(q)));
	return db
		.select({
			id: players.id,
			slug: players.slug,
			displayName: players.displayName,
			dateOfBirth: players.dateOfBirth,
			role: players.role,
			visibility: players.visibility,
			guardianConsent: players.guardianConsent,
			userId: players.userId,
		})
		.from(players)
		.where(where)
		.orderBy(asc(players.displayName))
		.limit(100);
}

export type SquadMember = PlayerListItem & {
	squadRole: "CAPTAIN" | "VICE_CAPTAIN" | "WICKET_KEEPER" | "PLAYER";
};

export async function getSquad(teamId: string): Promise<SquadMember[]> {
	"use cache";
	cacheTag(playerTags.squad(teamId));
	const rows = await db
		.select({
			id: players.id,
			slug: players.slug,
			displayName: players.displayName,
			dateOfBirth: players.dateOfBirth,
			role: players.role,
			visibility: players.visibility,
			guardianConsent: players.guardianConsent,
			userId: players.userId,
			squadRole: teamPlayers.squadRole,
		})
		.from(teamPlayers)
		.innerJoin(players, eq(players.id, teamPlayers.playerId))
		.where(and(eq(teamPlayers.teamId, teamId), isNull(teamPlayers.leftAt)));
	const order = { CAPTAIN: 0, VICE_CAPTAIN: 1, WICKET_KEEPER: 2, PLAYER: 3 } as const;
	return rows.sort(
		(a, b) => order[a.squadRole] - order[b.squadRole] || a.displayName.localeCompare(b.displayName),
	);
}

/** Pending claims on players in this squad (for the team's managers; not cached). */
export async function pendingClaimsForTeam(teamId: string) {
	const squad = await db
		.select({ playerId: teamPlayers.playerId })
		.from(teamPlayers)
		.where(and(eq(teamPlayers.teamId, teamId), isNull(teamPlayers.leftAt)));
	if (squad.length === 0) return [];
	return db
		.select({
			id: playerClaims.id,
			message: playerClaims.message,
			playerName: players.displayName,
			claimantName: users.name,
			claimantEmail: users.email,
		})
		.from(playerClaims)
		.innerJoin(players, eq(players.id, playerClaims.playerId))
		.innerJoin(users, eq(users.id, playerClaims.userId))
		.where(
			and(
				eq(playerClaims.status, "PENDING"),
				inArray(
					playerClaims.playerId,
					squad.map((s) => s.playerId),
				),
			),
		)
		.orderBy(asc(playerClaims.createdAt));
}
