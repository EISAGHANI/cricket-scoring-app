import { authorize } from "@cricket/authz";
import { schema } from "@cricket/db";
import { audit } from "@/lib/services/audit";
import type { ServiceContext } from "@/lib/services/context";
import { parse } from "@/lib/services/result";
import { VenueInput } from "./schemas";

/** Create a public venue, or one owned by an organisation (its admins only). */
export async function createVenue(ctx: ServiceContext, raw: unknown) {
	const input = parse(VenueInput, raw);
	const organizationId = input.organizationId ?? null;
	authorize(ctx.subject, "venue.create", {
		type: "venue",
		id: null,
		organizationId,
		createdBy: null,
	});
	const subject = ctx.subject;
	return ctx.db.transaction(async (tx) => {
		const [venue] = await tx
			.insert(schema.venues)
			.values({ ...input, organizationId, createdBy: subject.userId })
			.returning({ id: schema.venues.id });
		const created = venue!;
		await audit(tx, {
			actorId: subject.userId,
			action: "venue.create",
			resourceType: "venue",
			resourceId: created.id,
			organizationId,
			after: input,
			ip: ctx.ip ?? null,
		});
		return { id: created.id };
	});
}
