import { can } from "@cricket/authz";
import { CalendarDays, MapPin, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Button, Card, LinkButton, PageSkeleton, SectionTitle } from "@/components/ui";
import { cancelMatchAction } from "@/features/matches/actions";
import { LiveMatch } from "@/features/matches/live-match";
import { StatusPill, matchTime } from "@/features/matches/match-tile";
import { getMatch, getMatchLog, type MatchDetail } from "@/features/matches/queries";
import { getSubject } from "@/lib/auth/session";

const MatchId = z.uuid();

async function load(params: PageProps<"/matches/[id]">["params"]) {
	const { id } = await params;
	if (!MatchId.safeParse(id).success) return null;
	return getMatch(id);
}

export async function generateMetadata({ params }: PageProps<"/matches/[id]">): Promise<Metadata> {
	const m = await load(params);
	return { title: m === null ? "Match" : `${m.home.shortName} v ${m.away.shortName}` };
}

export default function MatchPage({ params }: PageProps<"/matches/[id]">) {
	return (
		<div className="mx-auto max-w-3xl">
			<Suspense fallback={<PageSkeleton />}>
				<Match params={params} />
			</Suspense>
		</div>
	);
}

const OFFICIAL: Record<string, string> = {
	UMPIRE_1: "Umpire",
	UMPIRE_2: "Umpire",
	TV_UMPIRE: "TV umpire",
	REFEREE: "Referee",
};

async function Match({ params }: { params: PageProps<"/matches/[id]">["params"] }) {
	const match = await load(params);
	if (match === null) notFound();
	const log = await getMatchLog(match.id);
	return (
		<>
			<div className="mb-5">
				<div className="mb-2 flex items-center justify-between gap-2">
					<StatusPill status={match.status} />
					<Suspense fallback={null}>
						<ScorerControls match={match} />
					</Suspense>
				</div>
				<h1 className="font-display text-3xl font-bold uppercase tracking-wide sm:text-4xl">
					<Link href={`/teams/${match.home.slug}`} className="hover:text-brand">
						{match.home.name}
					</Link>{" "}
					<span className="text-muted">v</span>{" "}
					<Link href={`/teams/${match.away.slug}`} className="hover:text-brand">
						{match.away.name}
					</Link>
				</h1>
				<p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
					<span>{match.rules.format.replaceAll("_", " ")}</span>
					{match.rules.oversPerInnings !== null && <span>{match.rules.oversPerInnings} overs</span>}
					{match.scheduledAt !== null && (
						<span className="inline-flex items-center gap-1">
							<CalendarDays className="size-3.5" aria-hidden="true" />{" "}
							{matchTime(match.scheduledAt)}
						</span>
					)}
					{match.venue !== null && (
						<span className="inline-flex items-center gap-1">
							<MapPin className="size-3.5" aria-hidden="true" /> {match.venue}
						</span>
					)}
				</p>
			</div>
			{match.status === "CANCELLED" ? (
				<Card className="p-5 text-sm text-muted">This match was cancelled.</Card>
			) : (
				<LiveMatch
					key={match.lastSeq}
					matchId={match.id}
					initialLog={log}
					live={match.status === "LIVE" || match.status === "SCHEDULED"}
				/>
			)}
			{match.officials.length > 0 && (
				<section className="mt-8">
					<SectionTitle>Officials</SectionTitle>
					<Card className="divide-y divide-line">
						{match.officials.map((o) => (
							<p key={o.role} className="flex justify-between px-4 py-2.5 text-sm">
								<span className="text-muted">{OFFICIAL[o.role] ?? o.role}</span>
								<span className="font-semibold">{o.name}</span>
							</p>
						))}
					</Card>
				</section>
			)}
		</>
	);
}

/** Score / cancel buttons for the people allowed to use them. */
async function ScorerControls({ match }: { match: MatchDetail }) {
	const subject = await getSubject();
	const resource = {
		type: "match" as const,
		id: match.id,
		createdBy: match.createdBy,
		teams: [
			{ teamId: match.home.id, clubId: match.home.clubId },
			{ teamId: match.away.id, clubId: match.away.clubId },
		],
	};
	const canScore = can(subject, "match.score", resource);
	const canManage = can(subject, "match.manage", resource);
	const open = match.status === "SCHEDULED" || match.status === "LIVE";
	return (
		<div className="flex gap-2">
			{canManage && match.status === "SCHEDULED" && match.lastSeq === 0 && (
				<form action={cancelMatchAction.bind(null, match.id)}>
					<Button type="submit" variant="ghost" size="sm">
						Cancel match
					</Button>
				</form>
			)}
			{canScore && (
				<LinkButton
					href={`/matches/${match.id}/score`}
					size="sm"
					variant={open ? "primary" : "secondary"}
				>
					<Pencil className="size-4" aria-hidden="true" /> {open ? "Score" : "Scorer"}
				</LinkButton>
			)}
		</div>
	);
}
