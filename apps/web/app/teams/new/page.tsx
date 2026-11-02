import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { getClubBySlug } from "@/features/clubs/queries";
import { NotAllowed } from "@/features/shared/not-allowed";
import { TeamForm } from "@/features/teams/team-form";
import { viewerCan } from "@/lib/services/server";

export const metadata: Metadata = { title: "New team" };

export default function NewTeamPage({ searchParams }: PageProps<"/teams/new">) {
	return (
		<div className="mx-auto max-w-xl">
			<PageHeader
				title="New team"
				subtitle="You'll manage the team and can build its squad next."
			/>
			<Suspense fallback={<PageSkeleton />}>
				<NewTeam searchParams={searchParams} />
			</Suspense>
		</div>
	);
}

async function NewTeam({
	searchParams,
}: {
	searchParams: PageProps<"/teams/new">["searchParams"];
}) {
	const slug = (await searchParams).club;
	if (typeof slug !== "string") return <TeamForm club={null} />;
	const club = await getClubBySlug(slug);
	if (club === null) notFound();
	if (!(await viewerCan("team.create", { type: "team", id: null, clubId: club.id }))) {
		return (
			<NotAllowed backHref={`/clubs/${club.slug}`}>
				Only the club&apos;s admins can add teams to it.
			</NotAllowed>
		);
	}
	return <TeamForm club={{ id: club.id, name: club.name }} />;
}
