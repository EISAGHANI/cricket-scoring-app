import { can } from "@cricket/authz";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageSkeleton } from "@/components/ui";
import { getMatch, getMatchLog } from "@/features/matches/queries";
import { startPayload } from "@/features/matches/service";
import { ScorerScreen } from "@/features/scoring/scorer-screen";
import { NotAllowed } from "@/features/shared/not-allowed";
import { getSubject, requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Scorer" };

export default function ScorePage({ params }: PageProps<"/matches/[id]/score">) {
	return (
		<Suspense fallback={<PageSkeleton />}>
			<Score params={params} />
		</Suspense>
	);
}

async function Score({ params }: { params: PageProps<"/matches/[id]/score">["params"] }) {
	const { id } = await params;
	if (!z.uuid().safeParse(id).success) notFound();
	await requireUser(`/matches/${id}/score`);
	const match = await getMatch(id);
	if (match === null || match.status === "CANCELLED") notFound();
	const allowed = can(await getSubject(), "match.score", {
		type: "match",
		id: match.id,
		createdBy: match.createdBy,
		teams: [
			{ teamId: match.home.id, clubId: match.home.clubId },
			{ teamId: match.away.id, clubId: match.away.clubId },
		],
	});
	if (!allowed) {
		return (
			<NotAllowed backHref={`/matches/${id}`}>
				Only the match&apos;s creator and the scorers they added can score it.
			</NotAllowed>
		);
	}
	const [log, payload] = await Promise.all([
		getMatchLog(id),
		match.lastSeq === 0 ? startPayload(db, id) : Promise.resolve(null),
	]);
	return (
		<>
			<p className="mx-auto mb-3 max-w-3xl text-sm">
				<Link href={`/matches/${id}`} className="font-semibold text-muted hover:text-ink">
					← {match.home.shortName} v {match.away.shortName}
				</Link>
			</p>
			<ScorerScreen matchId={id} initialLog={log} startPayload={payload} />
		</>
	);
}
