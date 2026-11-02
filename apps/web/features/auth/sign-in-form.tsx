"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Segmented, inputClass } from "@/components/ui";
import { authClient } from "@/lib/auth/client";
import { safeNext } from "@/lib/auth/safe-next";

type Method = "email" | "phone";
type Step = { kind: "enter" } | { kind: "code"; to: string } | { kind: "linkSent"; to: string };

/** Passwordless sign-in: email code (or link), phone code, Google. New users are created on first sign-in. */
export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
	const router = useRouter();
	const next = safeNext(useSearchParams().get("next"));
	const [method, setMethod] = useState<Method>("email");
	const [step, setStep] = useState<Step>({ kind: "enter" });
	const [value, setValue] = useState("");
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function run(
		action: () => Promise<{ error: { message?: string } | null }>,
		onOk: () => void,
	) {
		setBusy(true);
		setError(null);
		try {
			const { error: err } = await action();
			if (err) setError(err.message ?? "Something went wrong. Try again.");
			else onOk();
		} catch {
			setError("Network error. Check your connection and try again.");
		} finally {
			setBusy(false);
		}
	}

	function done() {
		router.replace(next);
		router.refresh();
	}

	function sendCode(e: FormEvent) {
		e.preventDefault();
		const to = value.trim();
		void run(
			() =>
				method === "email"
					? authClient.emailOtp.sendVerificationOtp({ email: to, type: "sign-in" })
					: authClient.phoneNumber.sendOtp({ phoneNumber: to }),
			() => setStep({ kind: "code", to }),
		);
	}

	function verify(e: FormEvent) {
		e.preventDefault();
		if (step.kind !== "code") return;
		void run(
			() =>
				method === "email"
					? authClient.signIn.emailOtp({ email: step.to, otp: code.trim() })
					: authClient.phoneNumber.verify({ phoneNumber: step.to, code: code.trim() }),
			done,
		);
	}

	function sendLink() {
		const to = value.trim();
		void run(
			() => authClient.signIn.magicLink({ email: to, callbackURL: next }),
			() => setStep({ kind: "linkSent", to }),
		);
	}

	function google() {
		void run(
			() => authClient.signIn.social({ provider: "google", callbackURL: next }),
			() => {},
		);
	}

	if (step.kind === "linkSent") {
		return (
			<div className="space-y-3 text-center" role="status">
				<p className="text-lg font-semibold">Check your email</p>
				<p className="text-muted">
					We sent a sign-in link to <strong className="text-ink">{step.to}</strong>. It expires in
					10 minutes.
				</p>
				<Button variant="ghost" onClick={() => setStep({ kind: "enter" })}>
					Use a different method
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-5">
			{step.kind === "enter" ? (
				<>
					<Segmented<Method>
						label="Sign in with"
						value={method}
						onChange={(m) => {
							setMethod(m);
							setValue("");
							setError(null);
						}}
						options={[
							{ value: "email", label: "Email" },
							{ value: "phone", label: "Phone" },
						]}
					/>
					<form onSubmit={sendCode} className="space-y-4">
						<Field
							label={method === "email" ? "Email address" : "Mobile number"}
							hint={
								method === "phone" ? "Include the country code, e.g. +44 7700 900123" : undefined
							}
						>
							<input
								className={inputClass}
								type={method === "email" ? "email" : "tel"}
								autoComplete={method === "email" ? "email" : "tel"}
								inputMode={method === "email" ? "email" : "tel"}
								required
								value={value}
								onChange={(e) => setValue(e.target.value)}
								placeholder={method === "email" ? "you@example.com" : "+44 7700 900123"}
							/>
						</Field>
						<Button
							type="submit"
							size="lg"
							className="w-full"
							disabled={busy || value.trim() === ""}
						>
							{busy ? "Sending…" : "Send me a code"}
						</Button>
						{method === "email" && (
							<Button
								variant="ghost"
								className="w-full"
								disabled={busy || value.trim() === ""}
								onClick={sendLink}
							>
								Email me a sign-in link instead
							</Button>
						)}
					</form>
					{googleEnabled && (
						<>
							<div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
								<span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
							</div>
							<Button
								variant="secondary"
								size="lg"
								className="w-full"
								disabled={busy}
								onClick={google}
							>
								Continue with Google
							</Button>
						</>
					)}
				</>
			) : (
				<form onSubmit={verify} className="space-y-4">
					<p className="text-muted">
						Enter the 6-digit code we sent to <strong className="text-ink">{step.to}</strong>.
					</p>
					<Field label="Code">
						<input
							className={`${inputClass} text-center font-mono text-2xl tracking-[0.5em]`}
							inputMode="numeric"
							autoComplete="one-time-code"
							pattern="[0-9]{6}"
							maxLength={6}
							required
							autoFocus
							value={code}
							onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
						/>
					</Field>
					<Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6}>
						{busy ? "Checking…" : "Sign in"}
					</Button>
					<Button
						variant="ghost"
						className="w-full"
						onClick={() => {
							setStep({ kind: "enter" });
							setCode("");
						}}
					>
						Start again
					</Button>
				</form>
			)}
			{error && (
				<p
					role="alert"
					className="rounded-xl bg-wicket/10 px-4 py-3 text-sm font-medium text-wicket"
				>
					{error}
				</p>
			)}
		</div>
	);
}
