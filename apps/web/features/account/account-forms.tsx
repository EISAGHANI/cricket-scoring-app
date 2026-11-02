"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { authClient } from "@/lib/auth/client";

export function NameForm({ initialName }: { initialName: string }) {
	const router = useRouter();
	const [name, setName] = useState(initialName);
	const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

	async function save(e: FormEvent) {
		e.preventDefault();
		setState("saving");
		const { error } = await authClient.updateUser({ name: name.trim() });
		setState(error ? "error" : "saved");
		if (!error) router.refresh();
	}

	return (
		<form onSubmit={save} className="space-y-3">
			<Field label="Your name" hint="Shown on your profile and to your teams.">
				<input
					className={inputClass}
					required
					maxLength={80}
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
			</Field>
			<div className="flex items-center gap-3">
				<Button
					type="submit"
					disabled={state === "saving" || name.trim() === "" || name.trim() === initialName}
				>
					{state === "saving" ? "Saving…" : "Save"}
				</Button>
				<span role="status" className="text-sm text-muted">
					{state === "saved" && "Saved"}
					{state === "error" && <span className="text-wicket">Couldn&apos;t save. Try again.</span>}
				</span>
			</div>
		</form>
	);
}

export function SignOutButton() {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	return (
		<Button
			variant="secondary"
			disabled={busy}
			onClick={async () => {
				setBusy(true);
				await authClient.signOut();
				router.replace("/");
				router.refresh();
			}}
		>
			{busy ? "Signing out…" : "Sign out"}
		</Button>
	);
}
