import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LinkButton, PageSkeleton } from "@/components/ui";
import { getTeamBySlug, type TeamSummary } from "@/features/teams/queries";
import { viewerCan } from "@/lib/services/server";

const CATEGORY_LABEL: Record<TeamSummary["category"], string> = {
	SENIOR: "Senior",
	WOMEN: "Women",
	JUNIOR: "Junior",
	VETERANS: "Veterans",
	OTHER: "Other",
};

export async function generateMetadata({ params }: PageProps<"/teams/[slug]">): Promise<Metadata> {
	const team = await getTeamBySlug((await params).slug);
	return { title: team?.name ?? "Team" };
}

export default function TeamPage({ params }: PageProps<"/teams/[slug]">) {
	return (
		<Suspense fallback={<PageSkeleton />}>
			<Team params={params} />
		</Suspense>
	);
}

async function Team({ params }: { params: PageProps<"/teams/[slug]">["params"] }) {
	const team = await getTeamBySlug((await params).slug);
	if (team === null) notFound();
	return (
		<div className="mb-6 flex flex-wrap items-end justify-between gap-3">
			<div>
				<p className="text-sm font-semibold uppercase tracking-wide text-muted">
					{team.club === null ? (
						"Independent team"
					) : (
						<Link href={`/clubs/${team.club.slug}`} className="hover:text-ink">
							{team.club.name}
						</Link>
					)}{" "}
					· {CATEGORY_LABEL[team.category]}
				</p>
				<h1 className="font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">
					{team.name} <span className="font-mono text-2xl text-muted">{team.shortName}</span>
				</h1>
			</div>
			<Suspense fallback={null}>
				<TeamControls team={team} />
			</Suspense>
		</div>
	);
}

async function TeamControls({ team }: { team: TeamSummary }) {
	const canEdit = await viewerCan("team.update", {
		type: "team",
		id: team.id,
		clubId: team.club?.id ?? null,
	});
	if (!canEdit) return null;
	return (
		<LinkButton href={`/teams/${team.slug}/edit`} variant="ghost">
			<Pencil className="size-4" aria-hidden="true" /> Edit
		</LinkButton>
	);
}
