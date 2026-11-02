import { Pencil, Plus, Shield } from "lucide-react";
import type { Metadata } from "next";
import { Avatar } from "@/components/avatar";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, EmptyState, LinkButton, PageSkeleton, SectionTitle } from "@/components/ui";
import { getClubBySlug, type ClubDetail } from "@/features/clubs/queries";
import { viewerCan } from "@/lib/services/server";

export async function generateMetadata({ params }: PageProps<"/clubs/[slug]">): Promise<Metadata> {
	const club = await getClubBySlug((await params).slug);
	return { title: club?.name ?? "Club" };
}

export default function ClubPage({ params }: PageProps<"/clubs/[slug]">) {
	return (
		<Suspense fallback={<PageSkeleton />}>
			<Club params={params} />
		</Suspense>
	);
}

async function Club({ params }: { params: PageProps<"/clubs/[slug]">["params"] }) {
	const club = await getClubBySlug((await params).slug);
	if (club === null) notFound();
	return (
		<>
			<div className="mb-6 flex flex-wrap items-end justify-between gap-3">
				<div className="flex items-center gap-4">
					<Avatar src={club.logoUrl} name={club.name} size={72} shape="square" />
					<div>
						<p className="text-sm font-semibold uppercase tracking-wide text-muted">Club</p>
						<h1 className="font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">
							{club.name}
						</h1>
					</div>
				</div>
				<Suspense fallback={null}>
					<ClubControls club={club} />
				</Suspense>
			</div>
			<SectionTitle>Teams</SectionTitle>
			{club.teams.length === 0 ? (
				<EmptyState icon={<Shield className="size-8" aria-hidden="true" />} title="No teams yet">
					The club&apos;s admins can add its first XI, juniors, women&apos;s side and more.
				</EmptyState>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2">
					{club.teams.map((t) => (
						<li key={t.id}>
							<Link href={`/teams/${t.slug}`} className="block">
								<Card className="flex items-center justify-between p-4 transition hover:border-brand">
									<span className="font-semibold">{t.name}</span>
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

/** Viewer-specific controls: read the session, so they stream in separately. */
async function ClubControls({ club }: { club: ClubDetail }) {
	const [canEdit, canAddTeam] = await Promise.all([
		viewerCan("club.update", { type: "club", id: club.id }),
		viewerCan("team.create", { type: "team", id: null, clubId: club.id }),
	]);
	if (!canEdit && !canAddTeam) return null;
	return (
		<div className="flex gap-2">
			{canAddTeam && (
				<LinkButton href={`/teams/new?club=${club.slug}`} variant="secondary">
					<Plus className="size-4" aria-hidden="true" /> Add team
				</LinkButton>
			)}
			{canEdit && (
				<LinkButton href={`/clubs/${club.slug}/edit`} variant="ghost">
					<Pencil className="size-4" aria-hidden="true" /> Edit
				</LinkButton>
			)}
		</div>
	);
}
