"use client";

import { useActionState, useState } from "react";
import { Button, Field, Segmented } from "@/components/ui";
import { squadRoleOptions } from "@/features/players/labels";
import { FormError, SelectField, SubmitButton, TextField } from "@/features/shared/form";
import type { ActionResult } from "@/lib/services/result";
import { acceptInvitationAction, createInvitationAction, requestToJoinAction } from "./actions";

type State = ActionResult<unknown> | null;

export function InviteForm({ teamId }: { teamId: string }) {
	const [by, setBy] = useState<"email" | "phone">("email");
	const [result, formAction] = useActionState<State, FormData>(
		createInvitationAction.bind(null, teamId),
		null,
	);
	return (
		<form action={formAction} className="space-y-3">
			<Segmented<"email" | "phone">
				label="Invite by"
				value={by}
				onChange={setBy}
				options={[
					{ value: "email", label: "Email" },
					{ value: "phone", label: "Phone" },
				]}
			/>
			<div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
				{by === "email" ? (
					<TextField
						key="email"
						name="email"
						label="Email address"
						type="email"
						result={result}
						required
						autoComplete="off"
					/>
				) : (
					<TextField
						key="phone"
						name="phoneNumber"
						label="Mobile number"
						type="tel"
						result={result}
						required
						placeholder="+44 7700 900123"
					/>
				)}
				<SelectField
					name="squadRole"
					label="Joins as"
					options={squadRoleOptions}
					defaultValue="PLAYER"
				/>
			</div>
			<FormError result={result} />
			{result?.ok === true && (
				<p role="status" className="text-sm font-medium text-brand">
					Invitation sent.
				</p>
			)}
			<SubmitButton pending="Sending…">Send invitation</SubmitButton>
		</form>
	);
}

export function AcceptInvitationForm({ token }: { token: string }) {
	const [result, formAction] = useActionState<State, FormData>(
		acceptInvitationAction.bind(null, token),
		null,
	);
	return (
		<form action={formAction} className="space-y-3">
			<FormError result={result} />
			<SubmitButton pending="Joining…">Accept and join the squad</SubmitButton>
		</form>
	);
}

export function JoinRequestForm({ teamId }: { teamId: string }) {
	const [open, setOpen] = useState(false);
	const [result, formAction] = useActionState<State, FormData>(
		requestToJoinAction.bind(null, teamId),
		null,
	);
	if (!open) {
		return (
			<Button variant="secondary" onClick={() => setOpen(true)}>
				Ask to join this team
			</Button>
		);
	}
	return (
		<form action={formAction} className="space-y-3">
			<Field label="Message to the team (optional)">
				<textarea
					name="message"
					maxLength={500}
					rows={2}
					className="w-full rounded-xl border border-line bg-surface-2 p-3 text-[15px]"
				/>
			</Field>
			<FormError result={result} />
			<SubmitButton pending="Sending…">Send request</SubmitButton>
		</form>
	);
}
