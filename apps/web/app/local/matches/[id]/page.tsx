import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { MatchScreen } from "@/features/scoring/match-screen";

export const metadata: Metadata = { title: "Match" };

/**
 * Match data lives in the browser, so the server only resolves the id.
 * With Cache Components the param is runtime data and is read inside Suspense.
 */
export default function MatchPage({ params }: PageProps<"/local/matches/[id]">) {
	return (
		<Suspense fallback={<PageSkeleton />}>
			{params.then(({ id }) => (
				<MatchScreen id={id} />
			))}
		</Suspense>
	);
}
