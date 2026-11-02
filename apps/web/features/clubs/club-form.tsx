"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui";
import { FormError, SubmitButton, TextField } from "@/features/shared/form";
import type { ActionResult } from "@/lib/services/result";
import { createClubAction, updateClubAction } from "./actions";

export function ClubForm({ club }: { club?: { id: string; name: string } }) {
	const action = club === undefined ? createClubAction : updateClubAction.bind(null, club.id);
	const [result, formAction] = useActionState<ActionResult<unknown> | null, FormData>(action, null);
	return (
		<Card className="p-5">
			<form action={formAction} className="space-y-4">
				<TextField
					name="name"
					label="Club name"
					defaultValue={club?.name}
					result={result}
					required
					minLength={2}
					maxLength={80}
					autoComplete="organization"
				/>
				<FormError result={result} />
				<SubmitButton pending="Saving…">
					{club === undefined ? "Create club" : "Save changes"}
				</SubmitButton>
			</form>
		</Card>
	);
}
