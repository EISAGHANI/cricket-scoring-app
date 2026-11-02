"use client";

import { MapPin, Plus, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import type { Team } from "@/lib/cricket/types";
import { loadSampleTeams, useDB } from "@/lib/store";
import { Button, Card, EmptyState, PageHeader, PageSkeleton, TeamBadge } from "@/components/ui";
import { TeamEditor } from "./team-editor";

export function TeamsScreen() {
	const db = useDB();
	const [editing, setEditing] = useState<{ team?: Team; key: number } | null>(null);

	if (!db) return <PageSkeleton />;

	return (
		<div>
			<PageHeader
				title="Teams"
				subtitle="Squads you can pick from when you start a match."
				action={
					<Button onClick={() => setEditing({ key: Date.now() })}>
						<Plus className="size-4" aria-hidden="true" /> New team
					</Button>
				}
			/>

			{db.teams.length === 0 ? (
				<EmptyState
					icon={<Users className="size-8" aria-hidden="true" />}
					title="No teams yet"
					action={
						<>
							<Button onClick={() => setEditing({ key: Date.now() })}>
								<Plus className="size-4" aria-hidden="true" /> Create team
							</Button>
							<Button variant="secondary" onClick={loadSampleTeams}>
								<Sparkles className="size-4" aria-hidden="true" /> Load sample teams
							</Button>
						</>
					}
				>
					Add a team and its players once, then reuse it for every match.
				</EmptyState>
			) : (
				<ul className="grid gap-4 sm:grid-cols-2">
					{db.teams.map((t) => (
						<li key={t.id}>
							<button
								type="button"
								onClick={() => setEditing({ team: t, key: Date.now() })}
								className="w-full text-left"
							>
								<Card className="flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-brand/40">
									<TeamBadge name={t.name} color={t.color} label={t.shortName} size={56} />
									<div className="min-w-0 flex-1">
										<p className="truncate text-lg font-semibold">{t.name}</p>
										<p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
											<span className="inline-flex items-center gap-1">
												<Users className="size-3.5" aria-hidden="true" />
												{t.players.length} player{t.players.length === 1 ? "" : "s"}
											</span>
											{t.location && (
												<span className="inline-flex items-center gap-1">
													<MapPin className="size-3.5" aria-hidden="true" />
													{t.location}
												</span>
											)}
										</p>
										<p className="mt-1.5 truncate text-xs text-muted">
											{t.players
												.slice(0, 5)
												.map((p) => p.name)
												.join(" · ")}
											{t.players.length > 5 && " ..."}
										</p>
									</div>
								</Card>
							</button>
						</li>
					))}
				</ul>
			)}

			{editing && (
				<TeamEditor key={editing.key} team={editing.team} open onClose={() => setEditing(null)} />
			)}
		</div>
	);
}
