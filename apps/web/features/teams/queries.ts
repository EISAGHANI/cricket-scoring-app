import "server-only";
import { schema } from "@cricket/db";
import { and, asc, eq, ilike, isNull } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { containsPattern } from "@/lib/services/like";
import { mediaUrl } from "@/lib/storage";

const { clubs, teams, mediaAssets } = schema;

export const teamTags = {
	list: "teams",
	one: (id: string) => `team:${id}`,
	slug: (slug: string) => `team-slug:${slug.toLowerCase()}`,
};

export interface TeamSummary {
	id: string;
	slug: string;
	name: string;
	shortName: string;
	category: "SENIOR" | "WOMEN" | "JUNIOR" | "VETERANS" | "OTHER";
	club: { id: string; slug: string; name: string } | null;
	logoUrl: string | null;
}

const summaryColumns = {
	id: teams.id,
	slug: teams.slug,
	name: teams.name,
	shortName: teams.shortName,
	category: teams.category,
	clubId: clubs.id,
	clubSlug: clubs.slug,
	clubName: clubs.name,
	logo: mediaAssets.variants,
};

type SummaryRow = {
	id: string;
	slug: string;
	name: string;
	shortName: string;
	category: TeamSummary["category"];
	clubId: string | null;
	clubSlug: string | null;
	clubName: string | null;
	logo: Record<string, string> | null;
};

function toSummary(r: SummaryRow): TeamSummary {
	return {
		id: r.id,
		slug: r.slug,
		name: r.name,
		shortName: r.shortName,
		category: r.category,
		club:
			r.clubId === null || r.clubSlug === null || r.clubName === null
				? null
				: { id: r.clubId, slug: r.clubSlug, name: r.clubName },
		logoUrl: mediaUrl(r.logo, "512"),
	};
}

export async function listTeams(q: string | null): Promise<TeamSummary[]> {
	"use cache";
	cacheTag(teamTags.list);
	const where =
		q === null || q === ""
			? isNull(teams.deletedAt)
			: and(isNull(teams.deletedAt), ilike(teams.name, containsPattern(q)));
	const rows = await db
		.select(summaryColumns)
		.from(teams)
		.leftJoin(clubs, eq(clubs.id, teams.clubId))
		.leftJoin(mediaAssets, eq(mediaAssets.id, teams.logoAssetId))
		.where(where)
		.orderBy(asc(teams.name))
		.limit(100);
	return rows.map(toSummary);
}

export async function getTeamBySlug(slug: string): Promise<TeamSummary | null> {
	"use cache";
	cacheTag(teamTags.slug(slug));
	const [row] = await db
		.select(summaryColumns)
		.from(teams)
		.leftJoin(clubs, eq(clubs.id, teams.clubId))
		.leftJoin(mediaAssets, eq(mediaAssets.id, teams.logoAssetId))
		.where(and(eq(teams.slug, slug), isNull(teams.deletedAt)));
	if (row === undefined) return null;
	cacheTag(teamTags.one(row.id));
	return toSummary(row);
}
