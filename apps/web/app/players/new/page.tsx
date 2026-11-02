import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { PlayerForm } from "@/features/players/player-forms";
import { getOwnPlayerSlug } from "@/features/players/queries";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Your player profile" };

export default function NewPlayerPage() {
	return (
		<div className="mx-auto max-w-xl">
			<PageHeader
				title="Your player profile"
				subtitle="Already in a squad? Find your name in Players and claim that profile instead."
			/>
			<Suspense fallback={<PageSkeleton />}>
				<NewPlayer />
			</Suspense>
		</div>
	);
}

async function NewPlayer() {
	const user = await requireUser("/players/new");
	const existing = await getOwnPlayerSlug(user.id);
	if (existing !== null) redirect(`/players/${existing}`);
	return <PlayerForm />;
}
