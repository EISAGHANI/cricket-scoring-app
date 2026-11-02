"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { clubTags } from "@/features/clubs/queries";
import { formObject, toResult, type ActionResult } from "@/lib/services/result";
import { serviceContext } from "@/lib/services/server";
import { teamTags } from "./queries";
import { createTeam, updateTeam } from "./service";

export async function createTeamAction(_prev: ActionResult<unknown> | null, form: FormData) {
	const result = await toResult(async () => createTeam(await serviceContext(), formObject(form)));
	if (!result.ok) return result;
	updateTag(teamTags.list);
	if (result.data.clubId !== null) updateTag(clubTags.one(result.data.clubId));
	redirect(`/teams/${result.data.slug}`);
}

export async function updateTeamAction(
	teamId: string,
	_prev: ActionResult<unknown> | null,
	form: FormData,
) {
	const result = await toResult(async () =>
		updateTeam(await serviceContext(), teamId, formObject(form)),
	);
	if (!result.ok) return result;
	updateTag(teamTags.list);
	updateTag(teamTags.one(teamId));
	updateTag(teamTags.slug(result.data.slug));
	if (result.data.clubId !== null) updateTag(clubTags.one(result.data.clubId));
	redirect(`/teams/${result.data.slug}`);
}
