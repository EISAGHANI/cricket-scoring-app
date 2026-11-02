"use client";

import { useActionState } from "react";
import { Card, Field } from "@/components/ui";
import { FormError, SubmitButton } from "@/features/shared/form";
import type { ActionResult } from "@/lib/services/result";
import { uploadImageAction } from "./actions";
import type { MediaOwner } from "./service";

export function ImageUpload({
	owner,
	ownerId,
	label,
}: {
	owner: MediaOwner;
	ownerId: string;
	label: string;
}) {
	const [result, formAction] = useActionState<ActionResult<unknown> | null, FormData>(
		uploadImageAction.bind(null, owner, ownerId),
		null,
	);
	return (
		<Card className="p-5">
			<form action={formAction} className="space-y-3">
				<Field
					label={label}
					hint="JPEG, PNG, WebP or AVIF, up to 4 MB. It's cropped or fitted to a square."
				>
					<input
						type="file"
						name="file"
						accept="image/jpeg,image/png,image/webp,image/avif"
						required
						className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-surface-2 file:px-4 file:py-2.5 file:font-semibold"
					/>
				</Field>
				<FormError result={result} />
				{result?.ok === true && (
					<p role="status" className="text-sm font-medium text-brand">
						Uploaded.
					</p>
				)}
				<SubmitButton pending="Uploading…">Upload</SubmitButton>
			</form>
		</Card>
	);
}
