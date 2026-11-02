"use client";

import { useActionState } from "react";
import { Button, Card, Field } from "@/components/ui";
import { FormError, SelectField, SubmitButton, TextField } from "@/features/shared/form";
import type { ActionResult } from "@/lib/services/result";
import {
	addSquadPlayerAction,
	createOwnProfileAction,
	removeSquadPlayerAction,
	requestClaimAction,
	setSquadRoleAction,
	updatePlayerAction,
} from "./actions";
import { bowlingOptions, handOptions, roleOptions, squadRoleOptions } from "./labels";

type State = ActionResult<unknown> | null;

export interface EditablePlayer {
	id: string;
	displayName: string;
	dateOfBirth: string | null;
	battingHand: string | null;
	bowlingStyle: string | null;
	role: string | null;
	visibility: string;
	guardianConsent: boolean;
}

export function PlayerForm({ player }: { player?: EditablePlayer }) {
	const action =
		player === undefined ? createOwnProfileAction : updatePlayerAction.bind(null, player.id);
	const [result, formAction] = useActionState<State, FormData>(action, null);
	return (
		<Card className="p-5">
			<form action={formAction} className="space-y-4">
				<TextField
					name="displayName"
					label="Name"
					defaultValue={player?.displayName}
					result={result}
					required
					minLength={2}
					maxLength={80}
					autoComplete="name"
				/>
				<TextField
					name="dateOfBirth"
					label="Date of birth"
					hint="Optional. Never shown publicly; players under 18 get a restricted public profile."
					type="date"
					defaultValue={player?.dateOfBirth ?? undefined}
					result={result}
				/>
				<div className="grid gap-4 sm:grid-cols-2">
					<SelectField
						name="role"
						label="Playing role"
						options={roleOptions}
						defaultValue={player?.role ?? ""}
					/>
					<SelectField
						name="battingHand"
						label="Batting"
						options={handOptions}
						defaultValue={player?.battingHand ?? ""}
					/>
				</div>
				<SelectField
					name="bowlingStyle"
					label="Bowling"
					options={bowlingOptions}
					defaultValue={player?.bowlingStyle ?? ""}
				/>
				<SelectField
					name="visibility"
					label="Who can see the full profile"
					options={[
						{ value: "PUBLIC", label: "Everyone" },
						{ value: "PRIVATE_TO_TEAM", label: "Only my teams" },
					]}
					defaultValue={player?.visibility ?? "PUBLIC"}
				/>
				<label className="flex items-start gap-3 text-sm">
					<input
						type="checkbox"
						name="guardianConsent"
						defaultChecked={player?.guardianConsent ?? false}
						className="mt-0.5 size-5 accent-brand"
					/>
					<span>
						<strong>Guardian consent</strong> — for players under 18: a parent or guardian agrees to
						a public profile with full name and photo.
					</span>
				</label>
				<FormError result={result} />
				<SubmitButton pending="Saving…">
					{player === undefined ? "Create profile" : "Save changes"}
				</SubmitButton>
			</form>
		</Card>
	);
}

export function AddSquadPlayerForm({ teamId }: { teamId: string }) {
	const [result, formAction] = useActionState<State, FormData>(
		addSquadPlayerAction.bind(null, teamId),
		null,
	);
	return (
		<form action={formAction} className="space-y-3">
			<div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
				<TextField
					name="displayName"
					label="Add a player by name"
					hint="Creates a profile the player can claim later."
					result={result}
					required
					minLength={2}
					maxLength={80}
				/>
				<SelectField
					name="squadRole"
					label="Role"
					options={squadRoleOptions}
					defaultValue="PLAYER"
				/>
			</div>
			<FormError result={result} />
			{result?.ok === true && (
				<p role="status" className="text-sm font-medium text-brand">
					Added to the squad.
				</p>
			)}
			<SubmitButton pending="Adding…">Add to squad</SubmitButton>
		</form>
	);
}

export function SquadMemberControls({
	teamId,
	playerId,
	squadRole,
	name,
}: {
	teamId: string;
	playerId: string;
	squadRole: string;
	name: string;
}) {
	return (
		<div className="flex items-center gap-2">
			<form action={setSquadRoleAction.bind(null, teamId, playerId)}>
				<label className="sr-only" htmlFor={`role-${playerId}`}>
					Squad role for {name}
				</label>
				<select
					id={`role-${playerId}`}
					name="squadRole"
					defaultValue={squadRole}
					onChange={(e) => e.currentTarget.form?.requestSubmit()}
					className="h-9 rounded-xl border border-line bg-surface-2 px-2 text-sm"
				>
					{squadRoleOptions.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			</form>
			<form action={removeSquadPlayerAction.bind(null, teamId, playerId)}>
				<Button
					type="submit"
					variant="ghost"
					size="sm"
					aria-label={`Remove ${name} from the squad`}
				>
					Remove
				</Button>
			</form>
		</div>
	);
}

export function ClaimForm({ playerId }: { playerId: string }) {
	const [result, formAction] = useActionState<State, FormData>(
		requestClaimAction.bind(null, playerId),
		null,
	);
	if (result?.ok === true) {
		return (
			<p
				role="status"
				className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand"
			>
				Request sent. A team manager will review it.
			</p>
		);
	}
	return (
		<form action={formAction} className="space-y-3">
			<Field
				label="Is this you? Ask to claim this profile"
				hint="Optional message for the team's managers."
			>
				<textarea
					name="message"
					maxLength={500}
					rows={2}
					className="w-full rounded-xl border border-line bg-surface-2 p-3 text-[15px]"
				/>
			</Field>
			<FormError result={result} />
			<SubmitButton pending="Sending…">Claim this profile</SubmitButton>
		</form>
	);
}
