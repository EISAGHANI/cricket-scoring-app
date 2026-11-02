"use client";

import { CirclePlus, ListOrdered } from "lucide-react";
import { useState } from "react";
import { computeMatchState, matchPhase } from "@/lib/cricket/engine";
import { useDB } from "@/lib/store";
import { EmptyState, LinkButton, PageHeader, PageSkeleton, Segmented } from "@/components/ui";
import { MatchCard } from "./match-card";

type Filter = "all" | "live" | "completed";

export function MatchesScreen() {
	const db = useDB();
	const [filter, setFilter] = useState<Filter>("all");
	if (!db) return <PageSkeleton />;

	const rows = db.matches
		.map((m) => ({ m, done: matchPhase(computeMatchState(m)) === "completed" }))
		.filter(({ done }) => filter === "all" || (filter === "completed" ? done : !done))
		.sort((x, y) => y.m.updatedAt - x.m.updatedAt);

	return (
		<div>
			<PageHeader
				title="Matches"
				subtitle={`${db.matches.length} match${db.matches.length === 1 ? "" : "es"} on this device`}
				action={
					<LinkButton href="/matches/new">
						<CirclePlus className="size-4" aria-hidden="true" /> New match
					</LinkButton>
				}
			/>

			{db.matches.length === 0 ? (
				<EmptyState
					icon={<ListOrdered className="size-8" aria-hidden="true" />}
					title="No matches yet"
					action={<LinkButton href="/matches/new">Start your first match</LinkButton>}
				>
					Every match you score is saved here, with its full scorecard.
				</EmptyState>
			) : (
				<>
					<div className="mb-5 max-w-sm">
						<Segmented
							label="Filter matches"
							value={filter}
							onChange={setFilter}
							options={[
								{ value: "all", label: "All" },
								{ value: "live", label: "In progress" },
								{ value: "completed", label: "Completed" },
							]}
						/>
					</div>
					{rows.length === 0 ? (
						<p className="py-10 text-center text-muted">Nothing here yet.</p>
					) : (
						<div className="grid gap-4 sm:grid-cols-2">
							{rows.map(({ m }) => (
								<MatchCard key={m.id} match={m} />
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}
