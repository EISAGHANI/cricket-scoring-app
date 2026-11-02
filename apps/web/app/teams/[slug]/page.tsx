import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { can, playerView } from "@cricket/authz";
import { UsersRound } from "lucide-react";
import { Button, Card, EmptyState, LinkButton, PageSkeleton, SectionTitle } from "@/components/ui";
import { decideClaimAction } from "@/features/players/actions";
import { ROLE_LABEL, SQUAD_ROLE_LABEL } from "@/features/players/labels";
import { AddSquadPlayerForm, SquadMemberControls } from "@/features/players/player-forms";
import { getSquad, pendingClaimsForTeam, todayIso } from "@/features/players/queries";
import { getSubject } from "@/lib/auth/session";
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
		<>
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
			<Suspense fallback={<PageSkeleton />}>
				<Squad team={team} />
			</Suspense>
		</>
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

/** The squad, with privacy applied per viewer and management controls for team staff. */
async function Squad({ team }: { team: TeamSummary }) {
	const teamRef = { teamId: team.id, clubId: team.club?.id ?? null };
	const [squad, subject, today] = await Promise.all([getSquad(team.id), getSubject(), todayIso()]);
	const canManage = can(subject, "team.manageSquad", {
		type: "team",
		id: team.id,
		clubId: teamRef.clubId,
	});
	const canDecide = can(subject, "player.decideClaim", {
		type: "player",
		id: null,
		userId: null,
		teams: [teamRef],
	});
	const claims = canDecide ? await pendingClaimsForTeam(team.id) : [];
	return (
		<section aria-labelledby="squad-title">
			<SectionTitle>
				<span id="squad-title">Squad</span>
			</SectionTitle>
			{squad.length === 0 ? (
				<EmptyState
					icon={<UsersRound className="size-8" aria-hidden="true" />}
					title="No players yet"
				>
					{canManage
						? "Add players below or invite them."
						: "The team hasn't added its players yet."}
				</EmptyState>
			) : (
				<Card className="divide-y divide-line">
					{squad.map((m) => {
						const viewPrivate = can(subject, "player.viewPrivate", {
							type: "player",
							id: m.id,
							userId: m.userId,
							teams: [teamRef],
						});
						const view = playerView({ ...m, photoUrl: null }, viewPrivate, today);
						return (
							<div key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
								<div>
									<Link href={`/players/${m.slug}`} className="font-semibold hover:text-brand">
										{view.displayName}
									</Link>
									<p className="text-sm text-muted">
										{SQUAD_ROLE_LABEL[m.squadRole]}
										{!view.restricted && m.role !== null ? ` · ${ROLE_LABEL[m.role]}` : ""}
										{m.userId === null ? " · unclaimed" : ""}
									</p>
								</div>
								{canManage && (
									<SquadMemberControls
										teamId={team.id}
										playerId={m.id}
										squadRole={m.squadRole}
										name={view.displayName}
									/>
								)}
							</div>
						);
					})}
				</Card>
			)}
			{canManage && (
				<Card className="mt-4 p-5">
					<AddSquadPlayerForm teamId={team.id} />
				</Card>
			)}
			{claims.length > 0 && (
				<div className="mt-6">
					<SectionTitle>Profile claims</SectionTitle>
					<Card className="divide-y divide-line">
						{claims.map((c) => (
							<div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
								<div className="text-sm">
									<p>
										<strong>{c.claimantName || c.claimantEmail}</strong> says they are{" "}
										<strong>{c.playerName}</strong>
									</p>
									{c.message !== null && <p className="text-muted">“{c.message}”</p>}
								</div>
								<div className="flex gap-2">
									<form action={decideClaimAction.bind(null, c.id, team.id, true)}>
										<Button type="submit" size="sm">
											Approve
										</Button>
									</form>
									<form action={decideClaimAction.bind(null, c.id, team.id, false)}>
										<Button type="submit" size="sm" variant="secondary">
											Reject
										</Button>
									</form>
								</div>
							</div>
						))}
					</Card>
				</div>
			)}
		</section>
	);
}
