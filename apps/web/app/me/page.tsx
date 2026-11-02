import type { Metadata } from "next";
import { Avatar } from "@/components/avatar";
import { ImageUpload } from "@/features/media/image-upload";
import { Suspense } from "react";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { NameForm, SignOutButton } from "@/features/account/account-forms";
import { getOwnPlayerSlug } from "@/features/players/queries";
import { LinkButton } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Your account" };

export default function MePage() {
	return (
		<>
			<PageHeader title="Your account" />
			<Suspense fallback={<PageSkeleton />}>
				<Account />
			</Suspense>
		</>
	);
}

async function Account() {
	const user = await requireUser("/me");
	const playerSlug = await getOwnPlayerSlug(user.id);
	return (
		<div className="space-y-4">
			{user.name === "" && (
				<p
					role="status"
					className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand"
				>
					Welcome! Add your name so teammates can find you.
				</p>
			)}
			<div className="flex items-center gap-4">
				<Avatar src={user.image} name={user.name || "?"} size={72} />
				<p className="font-display text-2xl font-bold uppercase tracking-wide">
					{user.name || "New player"}
				</p>
			</div>
			<Card className="space-y-5 p-5">
				<dl className="grid gap-3 text-sm sm:grid-cols-2">
					<div>
						<dt className="text-muted">Email</dt>
						<dd className="font-semibold">{user.email ?? "Not set"}</dd>
					</div>
					<div>
						<dt className="text-muted">Phone</dt>
						<dd className="font-semibold">{user.phoneNumber ?? "Not set"}</dd>
					</div>
				</dl>
				<NameForm initialName={user.name} />
			</Card>
			<Card className="flex flex-wrap items-center justify-between gap-3 p-5">
				<p className="text-sm">
					{playerSlug === null
						? "You don't have a player profile yet."
						: "Your player profile shows your teams and, later, your stats."}
				</p>
				{playerSlug === null ? (
					<LinkButton href="/players/new" variant="secondary">
						Create player profile
					</LinkButton>
				) : (
					<LinkButton href={`/players/${playerSlug}`} variant="secondary">
						View player profile
					</LinkButton>
				)}
			</Card>
			<ImageUpload owner="USER" ownerId={user.id} label="Account picture" />
			<SignOutButton />
		</div>
	);
}
