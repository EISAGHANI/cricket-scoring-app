import { Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState, LinkButton, PageHeader, PageSkeleton } from "@/components/ui";
import { MatchWizard } from "@/features/matches/match-wizard";
import { allTeams, listVenues, teamsManagedBy } from "@/features/matches/queries";
import { getSubject, requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New match" };

export default function NewMatchPage() {
	return (
		<div className="mx-auto max-w-2xl">
			<PageHeader title="New match" subtitle="Pick the teams, format and playing XIs." />
			<Suspense fallback={<PageSkeleton />}>
				<NewMatch />
			</Suspense>
		</div>
	);
}

async function NewMatch() {
	await requireUser("/matches/new");
	const subject = await getSubject();
	if (subject === null) return null;
	const [myTeams, teams, venues] = await Promise.all([
		teamsManagedBy(subject),
		allTeams(),
		listVenues(),
	]);
	if (myTeams.length === 0) {
		return (
			<EmptyState
				icon={<Users className="size-8" aria-hidden="true" />}
				title="You need a team"
				action={<LinkButton href="/teams/new">Create a team</LinkButton>}
			>
				Matches are arranged by a team&apos;s manager or captain. Create your team first, or ask
				your team&apos;s manager to make you captain.
			</EmptyState>
		);
	}
	return <MatchWizard myTeams={myTeams} teams={teams} venues={venues} />;
}
