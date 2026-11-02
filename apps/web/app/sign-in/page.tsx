import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Skeleton } from "@/components/ui";
import { SignInForm } from "@/features/auth/sign-in-form";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
	const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
	return (
		<div className="mx-auto max-w-md">
			<h1 className="font-display text-4xl font-bold uppercase tracking-wide">Sign in</h1>
			<p className="mt-1 mb-6 text-muted">
				No password needed. New here? Signing in creates your account.
			</p>
			<Card className="p-5 sm:p-6">
				{/* The form reads ?next= from the URL, which is request-time data. */}
				<Suspense fallback={<Skeleton className="h-64" />}>
					<SignInForm googleEnabled={googleEnabled} />
				</Suspense>
			</Card>
		</div>
	);
}
