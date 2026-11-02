"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui";
import { FormError, SubmitButton, TextField } from "@/features/shared/form";
import type { ActionResult } from "@/lib/services/result";
import { createOrganizationAction, updateOrganizationAction } from "./actions";

export function OrganizationForm({
	organization,
}: {
	organization?: { id: string; name: string };
}) {
	const action =
		organization === undefined
			? createOrganizationAction
			: updateOrganizationAction.bind(null, organization.id);
	const [result, formAction] = useActionState<ActionResult<unknown> | null, FormData>(action, null);
	return (
		<Card className="p-5">
			<form action={formAction} className="space-y-4">
				<TextField
					name="name"
					label="League or association name"
					defaultValue={organization?.name}
					result={result}
					required
					minLength={2}
					maxLength={80}
				/>
				{organization === undefined && (
					<TextField
						name="slug"
						label="Web address"
						hint="Lowercase letters, digits and hyphens. Becomes your league website's address and can't be changed later."
						result={result}
						required
						pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
						autoCapitalize="none"
						spellCheck={false}
					/>
				)}
				<FormError result={result} />
				<SubmitButton pending="Saving…">
					{organization === undefined ? "Create league" : "Save changes"}
				</SubmitButton>
			</form>
		</Card>
	);
}
