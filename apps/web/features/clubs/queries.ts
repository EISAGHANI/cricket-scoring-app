import "server-only";
import { schema } from "@cricket/db";
import { and, asc, eq, ilike, isNull } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { containsPattern } from "@/lib/services/like";

const { clubs, teams } = schema;

export const clubTags = {
	list: "clubs",
	one: (id: string) => `club:${id}`,
	slug: (slug: string) => `club-slug:${slug.toLowerCase()}`,
};

export interface ClubSummary {
	id: string;
	slug: string;
	name: string;
}

/** Public club list with optional name search. Cached; invalidated by club changes. */
export async function listClubs(q: string | null): Promise<ClubSummary[]> {
	"use cache";
	cacheTag(clubTags.list);
	const where =
		q === null || q === ""
			? isNull(clubs.deletedAt)
			: and(isNull(clubs.deletedAt), ilike(clubs.name, containsPattern(q)));
	return db
		.select({ id: clubs.id, slug: clubs.slug, name: clubs.name })
		.from(clubs)
		.where(where)
		.orderBy(asc(clubs.name))
		.limit(100);
}

export interface ClubDetail extends ClubSummary {
	teams: { id: string; slug: string; name: string; shortName: string; category: string }[];
}

export async function getClubBySlug(slug: string): Promise<ClubDetail | null> {
	"use cache";
	cacheTag(clubTags.slug(slug));
	const [club] = await db
		.select({ id: clubs.id, slug: clubs.slug, name: clubs.name })
		.from(clubs)
		.where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)));
	if (club === undefined) return null;
	cacheTag(clubTags.one(club.id));
	const clubTeams = await db
		.select({
			id: teams.id,
			slug: teams.slug,
			name: teams.name,
			shortName: teams.shortName,
			category: teams.category,
		})
		.from(teams)
		.where(and(eq(teams.clubId, club.id), isNull(teams.deletedAt)))
		.orderBy(asc(teams.name));
	return { ...club, teams: clubTeams };
}
