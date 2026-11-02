import { playerView } from "@cricket/authz";
import { UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, EmptyState, LinkButton, PageHeader, PageSkeleton } from "@/components/ui";
import { ROLE_LABEL } from "@/features/players/labels";
import { listPlayers, todayIso } from "@/features/players/queries";
import { SearchBox } from "@/features/shared/search-box";

export const metadata: Metadata = { title: "Players" };

export default function PlayersPage({ searchParams }: PageProps<"/players">) {
	return (
		<>
			<PageHeader
				title="Players"
				action={<LinkButton href="/players/new">Create your profile</LinkButton>}
			/>
			<Suspense fallback={<PageSkeleton />}>
				<PlayerList searchParams={searchParams} />
			</Suspense>
		</>
	);
}

async function PlayerList({
	searchParams,
}: {
	searchParams: PageProps<"/players">["searchParams"];
}) {
	const raw = (await searchParams).q;
	const q = typeof raw === "string" ? raw.trim() : "";
	const [list, today] = await Promise.all([listPlayers(q), todayIso()]);
	return (
		<>
			<SearchBox placeholder="Search players" defaultValue={q} />
			{list.length === 0 ? (
				<EmptyState
					icon={<UserRound className="size-8" aria-hidden="true" />}
					title={q === "" ? "No players yet" : "No matching players"}
				>
					{q === ""
						? "Players appear here when they create a profile or join a squad."
						: `Nothing matches “${q}”.`}
				</EmptyState>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2">
					{list.map((p) => {
						// The public directory never shows private details (minors, team-only profiles).
						const view = playerView({ ...p, photoUrl: null }, false, today);
						return (
							<li key={p.id}>
								<Link href={`/players/${p.slug}`} className="block">
									<Card className="flex items-center justify-between gap-3 p-4 transition hover:border-brand">
										<span className="font-semibold">{view.displayName}</span>
										{!view.restricted && p.role !== null && (
											<span className="text-sm text-muted">{ROLE_LABEL[p.role]}</span>
										)}
									</Card>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</>
	);
}
