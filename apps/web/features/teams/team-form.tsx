"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui";
import { FormError, SelectField, SubmitButton, TextField } from "@/features/shared/form";
import type { ActionResult } from "@/lib/services/result";
import { createTeamAction, updateTeamAction } from "./actions";

const CATEGORIES = [
	{ value: "SENIOR", label: "Senior" },
	{ value: "WOMEN", label: "Women" },
	{ value: "JUNIOR", label: "Junior" },
	{ value: "VETERANS", label: "Veterans" },
	{ value: "OTHER", label: "Other" },
];

export function TeamForm({
	team,
	club,
}: {
	team?: { id: string; name: string; shortName: string; category: string };
	club?: { id: string; name: string } | null;
}) {
	const action = team === undefined ? createTeamAction : updateTeamAction.bind(null, team.id);
	const [result, formAction] = useActionState<ActionResult<unknown> | null, FormData>(action, null);
	return (
		<Card className="p-5">
			<form action={formAction} className="space-y-4">
				{team === undefined && club != null && (
					<input type="hidden" name="clubId" value={club.id} />
				)}
				{club != null && (
					<p className="text-sm text-muted">
						Club: <strong className="text-ink">{club.name}</strong>
					</p>
				)}
				<TextField
					name="name"
					label="Team name"
					defaultValue={team?.name}
					result={result}
					required
					minLength={2}
					maxLength={80}
				/>
				<TextField
					name="shortName"
					label="Short name"
					hint="Up to 6 letters or digits, shown on scoreboards"
					defaultValue={team?.shortName}
					result={result}
					required
					maxLength={6}
					className="uppercase"
				/>
				<SelectField
					name="category"
					label="Category"
					options={CATEGORIES}
					defaultValue={team?.category ?? "SENIOR"}
				/>
				<FormError result={result} />
				<SubmitButton pending="Saving…">
					{team === undefined ? "Create team" : "Save changes"}
				</SubmitButton>
			</form>
		</Card>
	);
}
