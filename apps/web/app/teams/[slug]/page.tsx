import { Pencil } from "lucide-react";
import { Avatar } from "@/components/avatar";
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
import { getCurrentUser, getSubject } from "@/lib/auth/session";
import { decideJoinRequestAction, revokeInvitationAction } from "@/features/invitations/actions";
import { InviteForm, JoinRequestForm } from "@/features/invitations/forms";
import {
	membershipOf,
	pendingInvitations,
	pendingJoinRequests,
} from "@/features/invitations/queries";
import { MatchSection } from "@/features/matches/match-tile";
import { listMatches } from "@/features/matches/queries";
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
				<div className="flex items-center gap-4">
					<Avatar src={team.logoUrl} name={team.name} size={72} shape="square" />
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
				</div>
				<Suspense fallback={null}>
					<TeamControls team={team} />
				</Suspense>
			</div>
			<Suspense fallback={null}>
				<TeamMatches team={team} />
			</Suspense>
			<Suspense fallback={<PageSkeleton />}>
				<Squad team={team} />
			</Suspense>
			<Suspense fallback={null}>
				<Membership team={team} />
			</Suspense>
		</>
	);
}

/** Live, upcoming and recent matches for this team (nothing when it has none). */
async function TeamMatches({ team }: { team: TeamSummary }) {
	const { live, upcoming, recent } = await listMatches(team.id);
	if (live.length + upcoming.length + recent.length === 0) return null;
	return (
		<>
			<MatchSection title="Live" matches={live} />
			<MatchSection title="Upcoming" matches={upcoming.slice(0, 4)} />
			<MatchSection title="Recent results" matches={recent.slice(0, 4)} />
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

/** Invitations and join requests for staff; "ask to join" for other signed-in users. */
async function Membership({ team }: { team: TeamSummary }) {
	const resource = { type: "team" as const, id: team.id, clubId: team.club?.id ?? null };
	const [subject, user] = await Promise.all([getSubject(), getCurrentUser()]);
	const canInvite = can(subject, "team.invite", resource);
	const canDecide = can(subject, "team.decideJoinRequest", resource);
	if (!canInvite && !canDecide) {
		if (user === null) return null;
		const status = await membershipOf(team.id, user.id);
		if (status === "member") return null;
		return (
			<div className="mt-6">
				{status === "pending" ? (
					<p role="status" className="text-sm text-muted">
						Your request to join is waiting for the team&apos;s staff.
					</p>
				) : (
					<JoinRequestForm teamId={team.id} />
				)}
			</div>
		);
	}
	const [invites, requests] = await Promise.all([
		canInvite ? pendingInvitations(team.id) : Promise.resolve([]),
		canDecide ? pendingJoinRequests(team.id) : Promise.resolve([]),
	]);
	return (
		<>
			{canInvite && (
				<section aria-labelledby="invite-title" className="mt-8">
					<SectionTitle>
						<span id="invite-title">Invite players</span>
					</SectionTitle>
					<Card className="p-5">
						<InviteForm teamId={team.id} />
					</Card>
					{invites.length > 0 && (
						<Card className="mt-3 divide-y divide-line">
							{invites.map((i) => (
								<div key={i.id} className="flex items-center justify-between gap-3 p-4 text-sm">
									<span>
										<strong>{i.email ?? i.phoneNumber}</strong>
										<span className="text-muted">
											{" "}
											· invited, expires {i.expiresAt.toISOString().slice(0, 10)}
										</span>
									</span>
									<form action={revokeInvitationAction.bind(null, i.id)}>
										<Button type="submit" size="sm" variant="ghost">
											Revoke
										</Button>
									</form>
								</div>
							))}
						</Card>
					)}
				</section>
			)}
			{requests.length > 0 && (
				<section aria-labelledby="requests-title" className="mt-8">
					<SectionTitle>
						<span id="requests-title">Join requests</span>
					</SectionTitle>
					<Card className="divide-y divide-line">
						{requests.map((r) => (
							<div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
								<div className="text-sm">
									<p>
										<strong>{r.name || r.email}</strong> wants to join
									</p>
									{r.message !== null && <p className="text-muted">“{r.message}”</p>}
								</div>
								<div className="flex gap-2">
									<form action={decideJoinRequestAction.bind(null, r.id, true)}>
										<Button type="submit" size="sm">
											Accept
										</Button>
									</form>
									<form action={decideJoinRequestAction.bind(null, r.id, false)}>
										<Button type="submit" size="sm" variant="secondary">
											Decline
										</Button>
									</form>
								</div>
							</div>
						))}
					</Card>
				</section>
			)}
		</>
	);
}
