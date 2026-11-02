import { Building2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, EmptyState, LinkButton, PageHeader, PageSkeleton } from "@/components/ui";
import { listClubs } from "@/features/clubs/queries";
import { SearchBox } from "@/features/shared/search-box";

export const metadata: Metadata = { title: "Clubs" };

export default function ClubsPage({ searchParams }: PageProps<"/clubs">) {
	return (
		<>
			<PageHeader
				title="Clubs"
				subtitle="Clubs run one or more teams."
				action={
					<LinkButton href="/clubs/new">
						<Plus className="size-5" aria-hidden="true" /> New club
					</LinkButton>
				}
			/>
			<Suspense fallback={<PageSkeleton />}>
				<ClubList searchParams={searchParams} />
			</Suspense>
		</>
	);
}

async function ClubList({ searchParams }: { searchParams: PageProps<"/clubs">["searchParams"] }) {
	const raw = (await searchParams).q;
	const q = typeof raw === "string" ? raw.trim() : "";
	const clubs = await listClubs(q);
	return (
		<>
			<SearchBox placeholder="Search clubs" defaultValue={q} />
			{clubs.length === 0 ? (
				<EmptyState
					icon={<Building2 className="size-8" aria-hidden="true" />}
					title={q === "" ? "No clubs yet" : "No matching clubs"}
					action={<LinkButton href="/clubs/new">Create a club</LinkButton>}
				>
					{q === "" ? "Create the first one and add your teams to it." : `Nothing matches “${q}”.`}
				</EmptyState>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2">
					{clubs.map((c) => (
						<li key={c.id}>
							<Link href={`/clubs/${c.slug}`} className="block">
								<Card className="p-4 font-semibold transition hover:border-brand">{c.name}</Card>
							</Link>
						</li>
					))}
				</ul>
			)}
		</>
	);
}
