"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { formObject, toResult, type ActionResult } from "@/lib/services/result";
import { serviceContext } from "@/lib/services/server";
import { organizationTags } from "./queries";
import { createOrganization, updateOrganization } from "./service";

export async function createOrganizationAction(
	_prev: ActionResult<unknown> | null,
	form: FormData,
) {
	const result = await toResult(async () =>
		createOrganization(await serviceContext(), formObject(form)),
	);
	if (!result.ok) return result;
	redirect(`/organizations/${result.data.slug}`);
}

export async function updateOrganizationAction(
	id: string,
	_prev: ActionResult<unknown> | null,
	form: FormData,
) {
	const result = await toResult(async () =>
		updateOrganization(await serviceContext(), id, formObject(form)),
	);
	if (!result.ok) return result;
	updateTag(organizationTags.one(id));
	updateTag(organizationTags.slug(result.data.slug));
	redirect(`/organizations/${result.data.slug}`);
}
