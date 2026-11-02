import { authorize } from "@cricket/authz";
import { schema } from "@cricket/db";
import { and, eq, isNull } from "drizzle-orm";
import { audit } from "@/lib/services/audit";
import type { ServiceContext } from "@/lib/services/context";
import { notFound } from "@/lib/services/errors";
import { parse } from "@/lib/services/result";
import { uniqueSlug } from "@/lib/services/slug";
import { ClubInput } from "./schemas";

const { clubs, roleAssignments } = schema;

/** Create a club. The creator becomes its CLUB_ADMIN. */
export async function createClub(ctx: ServiceContext, raw: unknown) {
	authorize(ctx.subject, "club.create", { type: "club", id: null });
	const subject = ctx.subject;
	const input = parse(ClubInput, raw);
	return ctx.db.transaction(async (tx) => {
		const slug = await uniqueSlug(tx, clubs, clubs.slug, input.name);
		const [club] = await tx
			.insert(clubs)
			.values({ name: input.name, slug, createdBy: subject.userId })
			.returning();
		const created = club!;
		await tx.insert(roleAssignments).values({
			userId: subject.userId,
			role: "CLUB_ADMIN",
			scopeType: "CLUB",
			scopeId: created.id,
			grantedBy: subject.userId,
		});
		await audit(tx, {
			actorId: subject.userId,
			action: "club.create",
			resourceType: "club",
			resourceId: created.id,
			after: input,
			ip: ctx.ip ?? null,
		});
		return { id: created.id, slug: created.slug };
	});
}

export async function updateClub(ctx: ServiceContext, id: string, raw: unknown) {
	const input = parse(ClubInput, raw);
	return ctx.db.transaction(async (tx) => {
		const [before] = await tx
			.select()
			.from(clubs)
			.where(and(eq(clubs.id, id), isNull(clubs.deletedAt)));
		if (before === undefined) throw notFound("Club");
		authorize(ctx.subject, "club.update", { type: "club", id });
		await tx.update(clubs).set({ name: input.name }).where(eq(clubs.id, id));
		await audit(tx, {
			actorId: ctx.subject.userId,
			action: "club.update",
			resourceType: "club",
			resourceId: id,
			before: { name: before.name },
			after: input,
			ip: ctx.ip ?? null,
		});
		return { id, slug: before.slug };
	});
}
