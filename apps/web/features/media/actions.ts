"use server";

import { refresh, updateTag } from "next/cache";
import { clubTags } from "@/features/clubs/queries";
import { organizationTags } from "@/features/organizations/queries";
import { playerTags } from "@/features/players/queries";
import { teamTags } from "@/features/teams/queries";
import { toResult, type ActionResult } from "@/lib/services/result";
import { serviceContext } from "@/lib/services/server";
import { objectStore } from "@/lib/storage";
import { uploadImage, type MediaOwner } from "./service";

const TAGS: Record<MediaOwner, ((id: string) => string)[]> = {
	USER: [],
	PLAYER: [playerTags.one],
	TEAM: [teamTags.one],
	CLUB: [clubTags.one],
	ORGANIZATION: [organizationTags.one],
};
const LIST_TAGS: Record<MediaOwner, string[]> = {
	USER: [],
	PLAYER: [playerTags.list],
	TEAM: [teamTags.list],
	CLUB: [clubTags.list],
	ORGANIZATION: [],
};

export async function uploadImageAction(
	owner: MediaOwner,
	ownerId: string,
	_prev: ActionResult<unknown> | null,
	form: FormData,
) {
	const file = form.get("file");
	const result = await toResult(async () => {
		const bytes =
			file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array();
		const type = file instanceof File ? file.type : "";
		return uploadImage(await serviceContext(), objectStore, owner, ownerId, { bytes, type });
	});
	if (result.ok) {
		for (const tag of TAGS[owner]) updateTag(tag(ownerId));
		for (const tag of LIST_TAGS[owner]) updateTag(tag);
		refresh();
	}
	return result;
}
