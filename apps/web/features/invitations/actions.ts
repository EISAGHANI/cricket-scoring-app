"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { playerTags } from "@/features/players/queries";
import { teamTags } from "@/features/teams/queries";
import { env } from "@/lib/env";
import { mailer } from "@/lib/mail";
import { formObject, toResult, type ActionResult } from "@/lib/services/result";
import { serviceContext } from "@/lib/services/server";
import { sms } from "@/lib/sms";
import {
	acceptInvitation,
	createInvitation,
	decideJoinRequest,
	requestToJoin,
	revokeInvitation,
} from "./service";

function touchSquad(teamId: string) {
	updateTag(playerTags.squad(teamId));
	updateTag(teamTags.one(teamId));
	updateTag(playerTags.list);
}

export async function createInvitationAction(
	teamId: string,
	_prev: ActionResult<unknown> | null,
	form: FormData,
) {
	const result = await toResult(async () => {
		const inv = await createInvitation(await serviceContext(), teamId, formObject(form));
		const link = `${env.NEXT_PUBLIC_APP_URL}/invitations/${inv.token}`;
		if (inv.email !== null) {
			await mailer.send({
				to: inv.email,
				subject: `You're invited to join ${inv.teamName}`,
				text: `You've been invited to join ${inv.teamName}.\n\nAccept the invitation: ${link}\n\nThe link expires in 14 days.`,
			});
		} else if (inv.phoneNumber !== null) {
			await sms.send(inv.phoneNumber, `Join ${inv.teamName} on Cricket Platform: ${link}`);
		}
		return { sentTo: inv.email ?? inv.phoneNumber };
	});
	if (result.ok) refresh();
	return result;
}

export async function revokeInvitationAction(invitationId: string) {
	const result = await toResult(async () => revokeInvitation(await serviceContext(), invitationId));
	if (result.ok) refresh();
}

export async function acceptInvitationAction(
	token: string,
	_prev: ActionResult<unknown> | null,
	_form: FormData,
) {
	const result = await toResult(async () => acceptInvitation(await serviceContext(), token));
	if (!result.ok) return result;
	touchSquad(result.data.teamId);
	redirect(`/teams/${result.data.teamSlug}`);
}

export async function requestToJoinAction(
	teamId: string,
	_prev: ActionResult<unknown> | null,
	form: FormData,
) {
	const result = await toResult(async () =>
		requestToJoin(await serviceContext(), teamId, formObject(form)),
	);
	if (result.ok) refresh();
	return result;
}

export async function decideJoinRequestAction(requestId: string, approve: boolean) {
	const result = await toResult(async () =>
		decideJoinRequest(await serviceContext(), requestId, approve),
	);
	if (result.ok) {
		touchSquad(result.data.teamId);
		refresh();
	}
}
