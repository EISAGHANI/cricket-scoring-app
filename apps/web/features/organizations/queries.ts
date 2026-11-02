import "server-only";
import { schema } from "@cricket/db";
import { and, eq, isNull } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { mediaUrl } from "@/lib/storage";

const { organizations, mediaAssets } = schema;

export const organizationTags = {
	one: (id: string) => `organization:${id}`,
	slug: (slug: string) => `organization-slug:${slug.toLowerCase()}`,
};

export interface OrganizationDetail {
	id: string;
	slug: string;
	name: string;
	logoUrl: string | null;
}

export async function getOrganizationBySlug(slug: string): Promise<OrganizationDetail | null> {
	"use cache";
	cacheTag(organizationTags.slug(slug));
	const [row] = await db
		.select({
			id: organizations.id,
			slug: organizations.slug,
			name: organizations.name,
			logo: mediaAssets.variants,
		})
		.from(organizations)
		.leftJoin(mediaAssets, eq(mediaAssets.id, organizations.logoAssetId))
		.where(and(eq(organizations.slug, slug), isNull(organizations.deletedAt)));
	if (row === undefined) return null;
	cacheTag(organizationTags.one(row.id));
	const { logo, ...org } = row;
	return { ...org, logoUrl: mediaUrl(logo, "512") };
}
