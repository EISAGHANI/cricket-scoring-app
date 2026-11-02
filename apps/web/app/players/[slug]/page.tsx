import { playerView, type Resource } from "@cricket/authz";
import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { Card, LinkButton, PageSkeleton, SectionTitle } from "@/components/ui";
import { BOWLING_LABEL, HAND_LABEL, ROLE_LABEL, SQUAD_ROLE_LABEL } from "@/features/players/labels";
import { ClaimForm } from "@/features/players/player-forms";
import { getPlayerBySlug, todayIso, type PlayerProfile } from "@/features/players/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { viewerCan } from "@/lib/services/server";

export const metadata: Metadata = { title: "Player" };

export default function PlayerPage({ params }: PageProps<"/players/[slug]">) {
	return (
		<Suspense fallback={<PageSkeleton />}>
			<Player params={params} />
		</Suspense>
	);
}

function resourceOf(p: PlayerProfile): Extract<Resource, { type: "player" }> {
	return {
		type: "player",
		id: p.id,
		userId: p.userId,
		teams: p.teams.map((t) => ({ teamId: t.teamId, clubId: t.clubId })),
	};
}

async function Player({ params }: { params: PageProps<"/players/[slug]">["params"] }) {
	const player = await getPlayerBySlug((await params).slug);
	if (player === null) notFound();
	const resource = resourceOf(player);
	const [canViewPrivate, canEdit, canClaim, user, today] = await Promise.all([
		viewerCan("player.viewPrivate", resource),
		viewerCan("player.update", resource),
		viewerCan("player.claim", resource),
		getCurrentUser(),
		todayIso(),
	]);
	const view = playerView(player, canViewPrivate, today);
	return (
		<>
			<div className="mb-6 flex flex-wrap items-end justify-between gap-3">
				<div className="flex items-center gap-4">
					<Avatar src={view.photoUrl} name={view.displayName} size={72} />
					<div>
						<p className="text-sm font-semibold uppercase tracking-wide text-muted">Player</p>
						<h1 className="font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">
							{view.displayName}
						</h1>
					</div>
				</div>
				{canEdit && (
					<LinkButton href={`/players/${player.slug}/edit`} variant="ghost">
						<Pencil className="size-4" aria-hidden="true" /> Edit
					</LinkButton>
				)}
			</div>

			{view.restricted ? (
				<Card className="p-5 text-muted">
					This profile is only visible to the player&apos;s teams.
				</Card>
			) : (
				<Card className="p-5">
					<dl className="grid gap-3 text-sm sm:grid-cols-3">
						<Detail term="Role" value={player.role === null ? null : ROLE_LABEL[player.role]} />
						<Detail
							term="Batting"
							value={player.battingHand === null ? null : HAND_LABEL[player.battingHand]}
						/>
						<Detail
							term="Bowling"
							value={
								player.bowlingStyle === null ? null : (BOWLING_LABEL[player.bowlingStyle] ?? null)
							}
						/>
						{view.dateOfBirth !== null && <Detail term="Born" value={view.dateOfBirth} />}
					</dl>
				</Card>
			)}

			<SectionTitle>Teams</SectionTitle>
			{player.teams.length === 0 ? (
				<p className="text-muted">Not in a squad yet.</p>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2">
					{player.teams.map((t) => (
						<li key={t.teamId}>
							<Link href={`/teams/${t.slug}`} className="block">
								<Card className="flex items-center justify-between p-4 transition hover:border-brand">
									<span className="font-semibold">{t.name}</span>
									<span className="text-sm text-muted">
										{SQUAD_ROLE_LABEL[t.squadRole as keyof typeof SQUAD_ROLE_LABEL]}
									</span>
								</Card>
							</Link>
						</li>
					))}
				</ul>
			)}

			{player.userId === null && (
				<div className="mt-6">
					{canClaim ? (
						<Card className="p-5">
							<ClaimForm playerId={player.id} />
						</Card>
					) : user === null ? (
						<p className="text-sm text-muted">
							Is this you?{" "}
							<Link
								href={`/sign-in?next=/players/${player.slug}`}
								className="font-semibold text-brand"
							>
								Sign in to claim this profile
							</Link>
							.
						</p>
					) : null}
				</div>
			)}
		</>
	);
}

function Detail({ term, value }: { term: string; value: string | null }) {
	return (
		<div>
			<dt className="text-muted">{term}</dt>
			<dd className="font-semibold">{value ?? "—"}</dd>
		</div>
	);
}
