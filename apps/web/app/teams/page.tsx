import { Plus, Shield } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, EmptyState, LinkButton, PageHeader, PageSkeleton } from "@/components/ui";
import { SearchBox } from "@/features/shared/search-box";
import { listTeams } from "@/features/teams/queries";

export const metadata: Metadata = { title: "Teams" };

export default function TeamsPage({ searchParams }: PageProps<"/teams">) {
	return (
		<>
			<PageHeader
				title="Teams"
				action={
					<LinkButton href="/teams/new">
						<Plus className="size-5" aria-hidden="true" /> New team
					</LinkButton>
				}
			/>
			<Suspense fallback={<PageSkeleton />}>
				<TeamList searchParams={searchParams} />
			</Suspense>
		</>
	);
}

async function TeamList({ searchParams }: { searchParams: PageProps<"/teams">["searchParams"] }) {
	const raw = (await searchParams).q;
	const q = typeof raw === "string" ? raw.trim() : "";
	const teams = await listTeams(q);
	return (
		<>
			<SearchBox placeholder="Search teams" defaultValue={q} />
			{teams.length === 0 ? (
				<EmptyState
					icon={<Shield className="size-8" aria-hidden="true" />}
					title={q === "" ? "No teams yet" : "No matching teams"}
					action={<LinkButton href="/teams/new">Create a team</LinkButton>}
				>
					{q === "" ? "Create a team, then build its squad." : `Nothing matches “${q}”.`}
				</EmptyState>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2">
					{teams.map((t) => (
						<li key={t.id}>
							<Link href={`/teams/${t.slug}`} className="block">
								<Card className="flex items-center justify-between gap-3 p-4 transition hover:border-brand">
									<span>
										<span className="block font-semibold">{t.name}</span>
										<span className="text-sm text-muted">{t.club?.name ?? "Independent"}</span>
									</span>
									<span className="font-mono text-sm text-muted">{t.shortName}</span>
								</Card>
							</Link>
						</li>
					))}
				</ul>
			)}
		</>
	);
}
