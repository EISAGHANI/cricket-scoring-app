import { authorize } from "@cricket/authz";
import { schema } from "@cricket/db";
import { and, eq, isNull } from "drizzle-orm";
import { audit } from "@/lib/services/audit";
import type { ServiceContext } from "@/lib/services/context";
import { notFound } from "@/lib/services/errors";
import { parse } from "@/lib/services/result";
import { uniqueSlug } from "@/lib/services/slug";
import { TeamInput } from "./schemas";

const { clubs, teams, roleAssignments } = schema;

/** Create a team, standalone or in a club. The creator becomes its TEAM_MANAGER. */
export async function createTeam(ctx: ServiceContext, raw: unknown) {
	const input = parse(TeamInput, raw);
	const clubId = input.clubId ?? null;
	return ctx.db.transaction(async (tx) => {
		if (clubId !== null) {
			const [club] = await tx
				.select({ id: clubs.id })
				.from(clubs)
				.where(and(eq(clubs.id, clubId), isNull(clubs.deletedAt)));
			if (club === undefined) throw notFound("Club");
		}
		authorize(ctx.subject, "team.create", { type: "team", id: null, clubId });
		const subject = ctx.subject;
		const slug = await uniqueSlug(tx, teams, teams.slug, input.name);
		const [team] = await tx
			.insert(teams)
			.values({
				name: input.name,
				shortName: input.shortName,
				category: input.category,
				clubId,
				slug,
				createdBy: subject.userId,
			})
			.returning();
		const created = team!;
		await tx.insert(roleAssignments).values({
			userId: subject.userId,
			role: "TEAM_MANAGER",
			scopeType: "TEAM",
			scopeId: created.id,
			grantedBy: subject.userId,
		});
		await audit(tx, {
			actorId: subject.userId,
			action: "team.create",
			resourceType: "team",
			resourceId: created.id,
			after: input,
			ip: ctx.ip ?? null,
		});
		return { id: created.id, slug: created.slug, clubId };
	});
}

export async function updateTeam(ctx: ServiceContext, id: string, raw: unknown) {
	const input = parse(TeamInput.omit({ clubId: true }), raw);
	return ctx.db.transaction(async (tx) => {
		const [before] = await tx
			.select()
			.from(teams)
			.where(and(eq(teams.id, id), isNull(teams.deletedAt)));
		if (before === undefined) throw notFound("Team");
		authorize(ctx.subject, "team.update", { type: "team", id, clubId: before.clubId });
		await tx.update(teams).set(input).where(eq(teams.id, id));
		await audit(tx, {
			actorId: ctx.subject.userId,
			action: "team.update",
			resourceType: "team",
			resourceId: id,
			before: { name: before.name, shortName: before.shortName, category: before.category },
			after: input,
			ip: ctx.ip ?? null,
		});
		return { id, slug: before.slug, clubId: before.clubId };
	});
}
