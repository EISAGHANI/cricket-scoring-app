import "server-only";
import { schema } from "@cricket/db";
import { and, eq, isNull } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { db } from "@/lib/db";

const { organizations } = schema;

export const organizationTags = {
	one: (id: string) => `organization:${id}`,
	slug: (slug: string) => `organization-slug:${slug.toLowerCase()}`,
};

export interface OrganizationDetail {
	id: string;
	slug: string;
	name: string;
}

export async function getOrganizationBySlug(slug: string): Promise<OrganizationDetail | null> {
	"use cache";
	cacheTag(organizationTags.slug(slug));
	const [org] = await db
		.select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
		.from(organizations)
		.where(and(eq(organizations.slug, slug), isNull(organizations.deletedAt)));
	if (org === undefined) return null;
	cacheTag(organizationTags.one(org.id));
	return org;
}
