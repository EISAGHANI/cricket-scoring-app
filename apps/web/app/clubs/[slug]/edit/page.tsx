import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ClubForm } from "@/features/clubs/club-form";
import { getClubBySlug } from "@/features/clubs/queries";
import { NotAllowed } from "@/features/shared/not-allowed";
import { requireUser } from "@/lib/auth/session";
import { viewerCan } from "@/lib/services/server";

export const metadata: Metadata = { title: "Edit club" };

export default function EditClubPage({ params }: PageProps<"/clubs/[slug]/edit">) {
	return (
		<div className="mx-auto max-w-xl">
			<PageHeader title="Edit club" />
			<Suspense fallback={<PageSkeleton />}>
				<Edit params={params} />
			</Suspense>
		</div>
	);
}

async function Edit({ params }: { params: PageProps<"/clubs/[slug]/edit">["params"] }) {
	const { slug } = await params;
	await requireUser(`/clubs/${slug}/edit`);
	const club = await getClubBySlug(slug);
	if (club === null) notFound();
	if (!(await viewerCan("club.update", { type: "club", id: club.id }))) {
		return (
			<NotAllowed backHref={`/clubs/${club.slug}`}>
				Only the club&apos;s admins can edit it.
			</NotAllowed>
		);
	}
	return <ClubForm club={club} />;
}
