import type { Metadata } from "next";
import { ImageUpload } from "@/features/media/image-upload";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { PlayerForm } from "@/features/players/player-forms";
import { getPlayerBySlug } from "@/features/players/queries";
import { NotAllowed } from "@/features/shared/not-allowed";
import { requireUser } from "@/lib/auth/session";
import { viewerCan } from "@/lib/services/server";

export const metadata: Metadata = { title: "Edit player" };

export default function EditPlayerPage({ params }: PageProps<"/players/[slug]/edit">) {
	return (
		<div className="mx-auto max-w-xl">
			<PageHeader title="Edit player" />
			<Suspense fallback={<PageSkeleton />}>
				<Edit params={params} />
			</Suspense>
		</div>
	);
}

async function Edit({ params }: { params: PageProps<"/players/[slug]/edit">["params"] }) {
	const { slug } = await params;
	await requireUser(`/players/${slug}/edit`);
	const player = await getPlayerBySlug(slug);
	if (player === null) notFound();
	const resource = {
		type: "player" as const,
		id: player.id,
		userId: player.userId,
		teams: player.teams.map((t) => ({ teamId: t.teamId, clubId: t.clubId })),
	};
	if (!(await viewerCan("player.update", resource))) {
		return (
			<NotAllowed backHref={`/players/${player.slug}`}>
				Only the player or their team&apos;s staff can edit this profile.
			</NotAllowed>
		);
	}
	return (
		<div className="space-y-4">
			<PlayerForm player={player} />
			<ImageUpload owner="PLAYER" ownerId={player.id} label="Photo" />
		</div>
	);
}
