import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui";
import type { MatchCardData, MatchStatus } from "./queries";

const STATUS: Record<MatchStatus, { label: string; className: string }> = {
	LIVE: { label: "Live", className: "bg-wicket text-white" },
	SCHEDULED: { label: "Upcoming", className: "bg-surface-2 text-muted" },
	COMPLETED: { label: "Result", className: "bg-brand-soft text-brand" },
	ABANDONED: { label: "Abandoned", className: "bg-surface-2 text-muted" },
	CANCELLED: { label: "Cancelled", className: "bg-surface-2 text-muted" },
};

export function StatusPill({ status }: { status: MatchStatus }) {
	const s = STATUS[status];
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${s.className}`}
		>
			{status === "LIVE" && (
				<span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden="true" />
			)}
			{s.label}
		</span>
	);
}

/** "Sat 4 Nov, 10:30" in UTC so server and client render the same text. */
export function matchTime(iso: string): string {
	return (
		new Intl.DateTimeFormat("en-GB", {
			weekday: "short",
			day: "numeric",
			month: "short",
			hour: "2-digit",
			minute: "2-digit",
			timeZone: "UTC",
		}).format(new Date(iso)) + " UTC"
	);
}

export function MatchTile({ match }: { match: MatchCardData }) {
	const score = (teamId: string) =>
		match.summary?.innings
			.filter((i) => i.teamId === teamId && !i.superOver)
			.map((i) => `${i.runs}/${i.wickets}`)
			.join(" & ") ?? "";
	return (
		<Link
			href={`/matches/${match.id}`}
			className="block rounded-3xl focus-visible:outline-2 focus-visible:outline-brand"
		>
			<Card className="p-4 transition hover:border-brand/40">
				<div className="mb-2 flex items-center justify-between gap-2">
					<StatusPill status={match.status} />
					<span className="text-xs font-semibold text-muted">
						{match.preset.replaceAll("_", " ")}
					</span>
				</div>
				{[match.home, match.away].map((t) => (
					<p key={t.id} className="flex items-baseline justify-between gap-3 py-0.5">
						<span className="truncate font-semibold">{t.name}</span>
						<span className="tabular shrink-0 font-display text-lg font-bold">{score(t.id)}</span>
					</p>
				))}
				{match.summary?.status != null && (
					<p className="mt-1.5 text-sm text-muted">{match.summary.status}</p>
				)}
				<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
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
				</div>
			</Card>
		</Link>
	);
}

export function MatchSection({
	title,
	matches,
	empty,
}: {
	title: string;
	matches: MatchCardData[];
	empty?: string;
}) {
	if (matches.length === 0 && empty === undefined) return null;
	return (
		<section className="mb-8">
			<h2 className="mb-3 font-display text-xl font-bold uppercase tracking-wide">{title}</h2>
			{matches.length === 0 ? (
				<p className="text-sm text-muted">{empty}</p>
			) : (
				<div className="grid gap-3 sm:grid-cols-2">
					{matches.map((m) => (
						<MatchTile key={m.id} match={m} />
					))}
				</div>
			)}
		</section>
	);
}
