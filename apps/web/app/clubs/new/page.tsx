import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ClubForm } from "@/features/clubs/club-form";

export const metadata: Metadata = { title: "New club" };

/** Signed-out visitors are redirected by proxy.ts; the action re-checks permission. */
export default function NewClubPage() {
	return (
		<div className="mx-auto max-w-xl">
			<PageHeader title="New club" subtitle="You'll be the club's admin and can add teams next." />
			<ClubForm />
		</div>
	);
}
