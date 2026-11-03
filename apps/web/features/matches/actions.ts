"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createVenue } from "@/features/venues/service";
import { getSubject } from "@/lib/auth/session";
import { toResult, type ActionResult } from "@/lib/services/result";
import { serviceContext } from "@/lib/services/server";
import { sideOptions, venueTags, type SideOption } from "./queries";
import { cancelMatch, createGuestPlayer, createMatch } from "./service";
import { matchTags } from "./tags";

/** The wizard submits a structured object, not FormData (lists of players). */
export async function createMatchAction(input: unknown): Promise<ActionResult<never>> {
	const result = await toResult(async () => createMatch(await serviceContext(), input));
	if (!result.ok) return result;
	updateTag(matchTags.list);
	redirect(`/matches/${result.data.id}`);
}

export async function sideOptionsAction(teamId: string): Promise<SideOption> {
	const subject = await getSubject();
	if (subject === null) return { squad: [], people: [] };
	return sideOptions(teamId, subject);
}

export async function createGuestPlayerAction(displayName: string) {
	return toResult(async () => createGuestPlayer(await serviceContext(), { displayName }));
}

export async function createVenueAction(input: { name: string; city?: string }) {
	const result = await toResult(async () => createVenue(await serviceContext(), input));
	if (result.ok) updateTag(venueTags.list);
	return result;
}

/** Form action: on failure (the match started meanwhile) the page simply re-renders. */
export async function cancelMatchAction(matchId: string): Promise<void> {
	const result = await toResult(async () => cancelMatch(await serviceContext(), matchId));
	if (!result.ok) {
		updateTag(matchTags.one(matchId));
		return;
	}
	updateTag(matchTags.list);
	updateTag(matchTags.one(matchId));
	redirect("/matches");
}
