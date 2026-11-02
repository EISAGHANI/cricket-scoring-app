"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, inputClass } from "@/components/ui";
import type { ActionResult } from "@/lib/services/result";

export function TextField({
	name,
	label,
	hint,
	defaultValue,
	result,
	className,
	...props
}: {
	name: string;
	label: string;
	hint?: string;
	defaultValue?: string | undefined;
	result: ActionResult<unknown> | null;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">) {
	const error = result !== null && !result.ok ? result.fieldErrors[name] : undefined;
	return (
		<Field label={label} hint={error ?? hint}>
			<input
				name={name}
				defaultValue={defaultValue}
				aria-invalid={error !== undefined}
				{...props}
				className={`${inputClass} ${error !== undefined ? "border-wicket" : ""} ${className ?? ""}`}
			/>
		</Field>
	);
}

export function SelectField({
	name,
	label,
	options,
	defaultValue,
}: {
	name: string;
	label: string;
	options: { value: string; label: string }[];
	defaultValue?: string;
}) {
	return (
		<Field label={label}>
			<select name={name} defaultValue={defaultValue} className={inputClass}>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</Field>
	);
}

export function SubmitButton({ children, pending }: { children: ReactNode; pending: string }) {
	const { pending: busy } = useFormStatus();
	return (
		<Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy}>
			{busy ? pending : children}
		</Button>
	);
}

export function FormError({ result }: { result: ActionResult<unknown> | null }) {
	if (result === null || result.ok) return null;
	return (
		<p role="alert" className="rounded-xl bg-wicket/10 px-4 py-3 text-sm font-medium text-wicket">
			{result.error}
		</p>
	);
}
