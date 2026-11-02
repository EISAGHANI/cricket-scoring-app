"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { formObject, toResult, type ActionResult } from "@/lib/services/result";
import { serviceContext } from "@/lib/services/server";
import { clubTags } from "./queries";
import { createClub, updateClub } from "./service";

export async function createClubAction(_prev: ActionResult<unknown> | null, form: FormData) {
	const result = await toResult(async () => createClub(await serviceContext(), formObject(form)));
	if (!result.ok) return result;
	updateTag(clubTags.list);
	redirect(`/clubs/${result.data.slug}`);
}

export async function updateClubAction(
	clubId: string,
	_prev: ActionResult<unknown> | null,
	form: FormData,
) {
	const result = await toResult(async () =>
		updateClub(await serviceContext(), clubId, formObject(form)),
	);
	if (!result.ok) return result;
	updateTag(clubTags.list);
	updateTag(clubTags.one(clubId));
	updateTag(clubTags.slug(result.data.slug));
	redirect(`/clubs/${result.data.slug}`);
}
