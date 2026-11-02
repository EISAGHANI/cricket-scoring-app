import type { Metadata } from "next";
import { ImageUpload } from "@/features/media/image-upload";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { NotAllowed } from "@/features/shared/not-allowed";
import { getTeamBySlug } from "@/features/teams/queries";
import { TeamForm } from "@/features/teams/team-form";
import { requireUser } from "@/lib/auth/session";
import { viewerCan } from "@/lib/services/server";

export const metadata: Metadata = { title: "Edit team" };

export default function EditTeamPage({ params }: PageProps<"/teams/[slug]/edit">) {
	return (
		<div className="mx-auto max-w-xl">
			<PageHeader title="Edit team" />
			<Suspense fallback={<PageSkeleton />}>
				<Edit params={params} />
			</Suspense>
		</div>
	);
}

async function Edit({ params }: { params: PageProps<"/teams/[slug]/edit">["params"] }) {
	const { slug } = await params;
	await requireUser(`/teams/${slug}/edit`);
	const team = await getTeamBySlug(slug);
	if (team === null) notFound();
	if (
		!(await viewerCan("team.update", { type: "team", id: team.id, clubId: team.club?.id ?? null }))
	) {
		return (
			<NotAllowed backHref={`/teams/${team.slug}`}>
				Only the team&apos;s managers can edit it.
			</NotAllowed>
		);
	}
	return (
		<div className="space-y-4">
			<TeamForm team={team} club={team.club} />
			<ImageUpload owner="TEAM" ownerId={team.id} label="Team logo" />
		</div>
	);
}
