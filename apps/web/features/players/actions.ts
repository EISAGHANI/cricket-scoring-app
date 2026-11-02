"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { teamTags } from "@/features/teams/queries";
import { formObject, toResult, type ActionResult } from "@/lib/services/result";
import { serviceContext } from "@/lib/services/server";
import { playerTags } from "./queries";
import {
	addSquadPlayer,
	createOwnProfile,
	decideClaim,
	removeSquadPlayer,
	requestClaim,
	setSquadRole,
	updatePlayer,
} from "./service";

function touchPlayer(id: string, slug?: string) {
	updateTag(playerTags.list);
	updateTag(playerTags.one(id));
	if (slug !== undefined) updateTag(playerTags.slug(slug));
}

function touchSquad(teamId: string) {
	updateTag(playerTags.squad(teamId));
	updateTag(teamTags.one(teamId));
	updateTag(playerTags.list);
}

export async function createOwnProfileAction(_prev: ActionResult<unknown> | null, form: FormData) {
	const result = await toResult(async () =>
		createOwnProfile(await serviceContext(), formObject(form)),
	);
	if (!result.ok) return result;
	touchPlayer(result.data.id, result.data.slug);
	redirect(`/players/${result.data.slug}`);
}

export async function updatePlayerAction(
	playerId: string,
	_prev: ActionResult<unknown> | null,
	form: FormData,
) {
	const result = await toResult(async () =>
		updatePlayer(await serviceContext(), playerId, formObject(form)),
	);
	if (!result.ok) return result;
	touchPlayer(playerId, result.data.slug);
	redirect(`/players/${result.data.slug}`);
}

export async function addSquadPlayerAction(
	teamId: string,
	_prev: ActionResult<unknown> | null,
	form: FormData,
) {
	const result = await toResult(async () =>
		addSquadPlayer(await serviceContext(), teamId, formObject(form)),
	);
	if (result.ok) {
		touchSquad(teamId);
		touchPlayer(result.data.playerId, result.data.slug);
	}
	return result;
}

export async function setSquadRoleAction(teamId: string, playerId: string, form: FormData) {
	const result = await toResult(async () =>
		setSquadRole(await serviceContext(), teamId, playerId, formObject(form)),
	);
	if (result.ok) {
		touchSquad(teamId);
		touchPlayer(playerId);
	}
}

export async function removeSquadPlayerAction(teamId: string, playerId: string) {
	const result = await toResult(async () =>
		removeSquadPlayer(await serviceContext(), teamId, playerId),
	);
	if (result.ok) {
		touchSquad(teamId);
		touchPlayer(playerId);
	}
}

export async function requestClaimAction(
	playerId: string,
	_prev: ActionResult<unknown> | null,
	form: FormData,
) {
	return toResult(async () => requestClaim(await serviceContext(), playerId, formObject(form)));
}

export async function decideClaimAction(claimId: string, teamId: string, approve: boolean) {
	const result = await toResult(async () => decideClaim(await serviceContext(), claimId, approve));
	if (result.ok) {
		touchSquad(teamId);
		touchPlayer(result.data.playerId);
	}
}
