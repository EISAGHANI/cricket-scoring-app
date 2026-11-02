import { MailOpen } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, EmptyState, LinkButton, PageSkeleton } from "@/components/ui";
import { AcceptInvitationForm } from "@/features/invitations/forms";
import { findInvitation } from "@/features/invitations/service";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Team invitation", robots: { index: false } };

export default function InvitationPage({ params }: PageProps<"/invitations/[token]">) {
	return (
		<div className="mx-auto max-w-md">
			<Suspense fallback={<PageSkeleton />}>
				<Invitation params={params} />
			</Suspense>
		</div>
	);
}

async function Invitation({ params }: { params: PageProps<"/invitations/[token]">["params"] }) {
	const { token } = await params;
	await connection();
	const [inv, user] = await Promise.all([findInvitation(db, token), getCurrentUser()]);
	const icon = <MailOpen className="size-8" aria-hidden="true" />;
	if (inv === null) {
		return (
			<EmptyState icon={icon} title="Invitation not found">
				The link may be incomplete. Ask the team to send a new one.
			</EmptyState>
		);
	}
	if (inv.state !== "PENDING") {
		return (
			<EmptyState
				icon={icon}
				title={`Invitation ${inv.state.toLowerCase()}`}
				action={<LinkButton href={`/teams/${inv.teamSlug}`}>View {inv.teamName}</LinkButton>}
			>
				{inv.state === "EXPIRED"
					? "Ask the team to send a new invitation."
					: "This invitation can no longer be used."}
			</EmptyState>
		);
	}
	return (
		<Card className="space-y-4 p-6">
			<p className="text-sm font-semibold uppercase tracking-wide text-muted">Team invitation</p>
			<h1 className="font-display text-3xl font-bold uppercase tracking-wide">
				Join {inv.teamName}
			</h1>
			<p className="text-muted">
				Sent to <strong className="text-ink">{inv.email ?? inv.phoneNumber}</strong>.
			</p>
			{user === null ? (
				<LinkButton
					href={`/sign-in?next=${encodeURIComponent(`/invitations/${token}`)}`}
					size="lg"
					className="w-full"
				>
					Sign in to accept
				</LinkButton>
			) : (
				<AcceptInvitationForm token={token} />
			)}
		</Card>
	);
}
