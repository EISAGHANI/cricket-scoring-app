import { Plus, Swords } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState, LinkButton, PageHeader, PageSkeleton } from "@/components/ui";
import { MatchSection } from "@/features/matches/match-tile";
import { listMatches } from "@/features/matches/queries";

export const metadata: Metadata = { title: "Matches" };

export default function MatchesPage() {
	return (
		<>
			<PageHeader
				title="Matches"
				action={
					<LinkButton href="/matches/new">
						<Plus className="size-5" aria-hidden="true" /> New match
					</LinkButton>
				}
			/>
			<Suspense fallback={<PageSkeleton />}>
				<Lists />
			</Suspense>
		</>
	);
}

async function Lists() {
	const { live, upcoming, recent } = await listMatches();
	if (live.length + upcoming.length + recent.length === 0) {
		return (
			<EmptyState
				icon={<Swords className="size-8" aria-hidden="true" />}
				title="No matches yet"
				action={<LinkButton href="/matches/new">Set up a match</LinkButton>}
			>
				Team managers and captains can arrange a match and score it ball by ball.
			</EmptyState>
		);
	}
	return (
		<>
			<MatchSection title="Live" matches={live} />
			<MatchSection title="Upcoming" matches={upcoming} />
			<MatchSection title="Recent results" matches={recent} />
		</>
	);
}
