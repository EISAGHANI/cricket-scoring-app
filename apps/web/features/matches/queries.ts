import "server-only";
import { can, isSuperAdmin, playerView, type Subject } from "@cricket/authz";
import { schema } from "@cricket/db";
import type { MatchSummary } from "@cricket/db/schema";
import type { MatchEvent, MatchRules } from "@cricket/scoring-engine";
import { aliasedTable, and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { matchTags } from "./tags";

const {
	teams,
	teamPlayers,
	players,
	venues,
	roleAssignments,
	users,
	matches,
	matchOfficials,
	ballEvents,
} = schema;

export { matchTags };
export const venueTags = { list: "venues" };

export interface TeamOption {
	id: string;
	name: string;
	shortName: string;
	clubId: string | null;
}

const teamOption = {
	id: teams.id,
	name: teams.name,
	shortName: teams.shortName,
	clubId: teams.clubId,
};

/** Every team, for picking an opponent. */
export async function allTeams(): Promise<TeamOption[]> {
	"use cache";
	cacheTag("teams");
	return db
		.select(teamOption)
		.from(teams)
		.where(isNull(teams.deletedAt))
		.orderBy(asc(teams.name))
		.limit(500);
}

/** Teams the viewer may arrange matches for (team staff, or admin of the team's club). */
export async function teamsManagedBy(subject: Subject): Promise<TeamOption[]> {
	if (isSuperAdmin(subject)) return allTeams();
	const teamIds = subject.roles
		.filter((r) => r.scopeType === "TEAM" && (r.role === "TEAM_MANAGER" || r.role === "CAPTAIN"))
		.flatMap((r) => (r.scopeId === null ? [] : [r.scopeId]));
	const clubIds = subject.roles
		.filter((r) => r.scopeType === "CLUB" && r.role === "CLUB_ADMIN")
		.flatMap((r) => (r.scopeId === null ? [] : [r.scopeId]));
	if (teamIds.length === 0 && clubIds.length === 0) return [];
	const scope = [
		...(teamIds.length > 0 ? [inArray(teams.id, teamIds)] : []),
		...(clubIds.length > 0 ? [inArray(teams.clubId, clubIds)] : []),
	];
	return db
		.select(teamOption)
		.from(teams)
		.where(and(isNull(teams.deletedAt), or(...scope)))
		.orderBy(asc(teams.name));
}

export interface VenueOption {
	id: string;
	name: string;
	city: string | null;
}

/** Public venues (organisation venues arrive with tournaments in Phase 6). */
export async function listVenues(): Promise<VenueOption[]> {
	"use cache";
	cacheTag(venueTags.list);
	return db
		.select({ id: venues.id, name: venues.name, city: venues.city })
		.from(venues)
		.where(isNull(venues.organizationId))
		.orderBy(asc(venues.name))
		.limit(500);
}

export interface SideOption {
	squad: {
		id: string;
		name: string;
		squadRole: "CAPTAIN" | "VICE_CAPTAIN" | "WICKET_KEEPER" | "PLAYER";
	}[];
	/** Users connected to the team, who may be added as scorers. */
	people: { userId: string; name: string }[];
}

/** A team's squad (names as this viewer may see them) and its people, for the setup wizard. */
export async function sideOptions(teamId: string, subject: Subject | null): Promise<SideOption> {
	const [team] = await db
		.select({ clubId: teams.clubId })
		.from(teams)
		.where(and(eq(teams.id, teamId), isNull(teams.deletedAt)));
	if (team === undefined) return { squad: [], people: [] };
	const rows = await db
		.select({
			id: players.id,
			userId: players.userId,
			displayName: players.displayName,
			dateOfBirth: players.dateOfBirth,
			visibility: players.visibility,
			guardianConsent: players.guardianConsent,
			squadRole: teamPlayers.squadRole,
		})
		.from(teamPlayers)
		.innerJoin(players, eq(players.id, teamPlayers.playerId))
		.where(
			and(eq(teamPlayers.teamId, teamId), isNull(teamPlayers.leftAt), isNull(players.deletedAt)),
		);
	const today = new Date().toISOString().slice(0, 10);
	const ref = { teamId, clubId: team.clubId };
	const order = { CAPTAIN: 0, VICE_CAPTAIN: 1, WICKET_KEEPER: 2, PLAYER: 3 } as const;
	const squad = rows
		.map((r) => {
			const mayView = can(subject, "player.viewPrivate", {
				type: "player",
				id: r.id,
				userId: r.userId,
				teams: [ref],
			});
			return {
				id: r.id,
				name: playerView({ ...r, photoUrl: null }, mayView, today).displayName,
				squadRole: r.squadRole,
			};
		})
		.sort((a, b) => order[a.squadRole] - order[b.squadRole] || a.name.localeCompare(b.name));

	const staff = await db
		.selectDistinct({ userId: users.id, name: users.name })
		.from(roleAssignments)
		.innerJoin(users, eq(users.id, roleAssignments.userId))
		.where(and(eq(roleAssignments.scopeType, "TEAM"), eq(roleAssignments.scopeId, teamId)));
	const people = new Map(staff.map((s) => [s.userId, s.name]));
	for (const r of rows) {
		if (r.userId !== null && !people.has(r.userId)) {
			const s = squad.find((p) => p.id === r.id);
			people.set(r.userId, s?.name ?? r.displayName);
		}
	}
	return {
		squad,
		people: [...people]
			.map(([userId, name]) => ({ userId, name }))
			.sort((a, b) => a.name.localeCompare(b.name)),
	};
}

export type MatchStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "ABANDONED" | "CANCELLED";

export interface MatchTeam {
	id: string;
	slug: string;
	name: string;
	shortName: string;
	clubId: string | null;
}

export interface MatchCardData {
	id: string;
	status: MatchStatus;
	preset: string;
	home: MatchTeam;
	away: MatchTeam;
	venue: string | null;
	/** ISO timestamp. */
	scheduledAt: string | null;
	summary: MatchSummary | null;
}

export interface MatchDetail extends MatchCardData {
	rules: MatchRules;
	createdBy: string | null;
	lastSeq: number;
	officials: { role: string; name: string }[];
}

const home = aliasedTable(teams, "home");
const away = aliasedTable(teams, "away");

const cardColumns = {
	id: matches.id,
	status: matches.status,
	preset: matches.preset,
	scheduledAt: matches.scheduledAt,
	summary: matches.summary,
	rules: matches.rules,
	createdBy: matches.createdBy,
	lastSeq: matches.lastSeq,
	venueName: venues.name,
	venueCity: venues.city,
	homeId: home.id,
	homeSlug: home.slug,
	homeName: home.name,
	homeShort: home.shortName,
	homeClub: home.clubId,
	awayId: away.id,
	awaySlug: away.slug,
	awayName: away.name,
	awayShort: away.shortName,
	awayClub: away.clubId,
};

function cardQuery() {
	return db
		.select(cardColumns)
		.from(matches)
		.innerJoin(home, eq(home.id, matches.homeTeamId))
		.innerJoin(away, eq(away.id, matches.awayTeamId))
		.leftJoin(venues, eq(venues.id, matches.venueId));
}

type CardRow = Awaited<ReturnType<typeof cardQuery>>[number];

function toCard(r: CardRow): MatchCardData {
	return {
		id: r.id,
		status: r.status,
		preset: r.preset,
		home: {
			id: r.homeId,
			slug: r.homeSlug,
			name: r.homeName,
			shortName: r.homeShort,
			clubId: r.homeClub,
		},
		away: {
			id: r.awayId,
			slug: r.awaySlug,
			name: r.awayName,
			shortName: r.awayShort,
			clubId: r.awayClub,
		},
		venue: r.venueName === null ? null : [r.venueName, r.venueCity].filter(Boolean).join(", "),
		scheduledAt: r.scheduledAt?.toISOString() ?? null,
		summary: r.summary,
	};
}

export async function getMatch(id: string): Promise<MatchDetail | null> {
	"use cache";
	cacheTag(matchTags.one(id));
	const [row] = await cardQuery().where(eq(matches.id, id));
	if (row === undefined) return null;
	const officials = await db
		.select({ role: matchOfficials.role, name: matchOfficials.name })
		.from(matchOfficials)
		.where(eq(matchOfficials.matchId, id))
		.orderBy(asc(matchOfficials.role));
	return {
		...toCard(row),
		rules: row.rules,
		createdBy: row.createdBy,
		lastSeq: row.lastSeq,
		officials,
	};
}

/** The full stored log (the client replays it; polling fetches only what's new). */
export async function getMatchLog(id: string): Promise<MatchEvent[]> {
	"use cache";
	cacheTag(matchTags.one(id));
	const rows = await db
		.select({
			id: ballEvents.id,
			seq: ballEvents.seq,
			type: ballEvents.type,
			payload: ballEvents.payload,
		})
		.from(ballEvents)
		.where(eq(ballEvents.matchId, id))
		.orderBy(asc(ballEvents.seq));
	return rows.map(
		(r) => ({ id: r.id, seq: r.seq, type: r.type, payload: r.payload }) as MatchEvent,
	);
}

export interface MatchLists {
	live: MatchCardData[];
	upcoming: MatchCardData[];
	recent: MatchCardData[];
}

/** Live, upcoming and recent matches, optionally for one team. */
export async function listMatches(teamId: string | null = null): Promise<MatchLists> {
	"use cache";
	cacheTag(matchTags.list);
	const team =
		teamId === null
			? undefined
			: or(eq(matches.homeTeamId, teamId), eq(matches.awayTeamId, teamId));
	const [live, upcoming, recent] = await Promise.all([
		cardQuery()
			.where(and(eq(matches.status, "LIVE"), team))
			.orderBy(desc(matches.startedAt))
			.limit(50),
		cardQuery()
			.where(and(eq(matches.status, "SCHEDULED"), team))
			.orderBy(asc(matches.scheduledAt), desc(matches.createdAt))
			.limit(50),
		cardQuery()
			.where(and(inArray(matches.status, ["COMPLETED", "ABANDONED"]), team))
			.orderBy(desc(matches.completedAt))
			.limit(30),
	]);
	return { live: live.map(toCard), upcoming: upcoming.map(toCard), recent: recent.map(toCard) };
}
