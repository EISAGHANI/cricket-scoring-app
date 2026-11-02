import { authorize } from "@cricket/authz";
import { schema } from "@cricket/db";
import { and, eq, isNull } from "drizzle-orm";
import { audit } from "@/lib/services/audit";
import type { ServiceContext } from "@/lib/services/context";
import { conflict, notFound } from "@/lib/services/errors";
import { parse } from "@/lib/services/result";
import { OrganizationInput } from "./schemas";

const { organizations, roleAssignments } = schema;

/** Create a league/association (tenant). The creator becomes its ORG_ADMIN. */
export async function createOrganization(ctx: ServiceContext, raw: unknown) {
	authorize(ctx.subject, "organization.create", { type: "organization", id: null });
	const subject = ctx.subject;
	const input = parse(OrganizationInput, raw);
	return ctx.db.transaction(async (tx) => {
		const [taken] = await tx
			.select({ id: organizations.id })
			.from(organizations)
			.where(eq(organizations.slug, input.slug));
		if (taken !== undefined) throw conflict("That address is already taken", "slug");
		const [org] = await tx
			.insert(organizations)
			.values({ name: input.name, slug: input.slug, createdBy: subject.userId })
			.returning();
		const created = org!;
		await tx.insert(roleAssignments).values({
			userId: subject.userId,
			role: "ORG_ADMIN",
			scopeType: "ORGANIZATION",
			scopeId: created.id,
			grantedBy: subject.userId,
		});
		await audit(tx, {
			actorId: subject.userId,
			action: "organization.create",
			resourceType: "organization",
			resourceId: created.id,
			organizationId: created.id,
			after: input,
			ip: ctx.ip ?? null,
		});
		return { id: created.id, slug: created.slug };
	});
}

export async function updateOrganization(ctx: ServiceContext, id: string, raw: unknown) {
	const input = parse(OrganizationInput.pick({ name: true }), raw);
	return ctx.db.transaction(async (tx) => {
		const [before] = await tx
			.select()
			.from(organizations)
			.where(and(eq(organizations.id, id), isNull(organizations.deletedAt)));
		if (before === undefined) throw notFound("Organisation");
		authorize(ctx.subject, "organization.update", { type: "organization", id });
		await tx.update(organizations).set({ name: input.name }).where(eq(organizations.id, id));
		await audit(tx, {
			actorId: ctx.subject.userId,
			action: "organization.update",
			resourceType: "organization",
			resourceId: id,
			organizationId: id,
			before: { name: before.name },
			after: input,
			ip: ctx.ip ?? null,
		});
		return { id, slug: before.slug };
	});
}
