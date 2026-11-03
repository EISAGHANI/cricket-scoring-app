import { ArrowRight, CirclePlus, ClipboardList, Radio, Trophy, Undo2 } from "lucide-react";
import { Suspense } from "react";
import { Card, LinkButton, SectionTitle, Skeleton } from "@/components/ui";
import { MatchTile } from "@/features/matches/match-tile";
import { listMatches } from "@/features/matches/queries";

export function HomeScreen() {
	return (
		<div className="space-y-10">
			<section className="pitch relative overflow-hidden rounded-[2rem] px-6 py-9 shadow-card sm:px-10 sm:py-12">
				<div className="relative z-10 max-w-xl">
					<p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
						<Radio className="size-3.5" aria-hidden="true" /> Live ball-by-ball cricket
					</p>
					<h1 className="font-display text-5xl font-bold uppercase leading-[0.95] tracking-wide sm:text-6xl">
						Score every ball.
						<br />
						<span className="text-[#b8f5cf]">Follow every match.</span>
					</h1>
					<p className="mt-4 max-w-md text-[15px] text-white/80">
						Set up a match from your squads, score it with one tap per ball, and everyone can follow
						the live scorecard and commentary.
					</p>
					<div className="mt-7 flex flex-wrap gap-3">
						<LinkButton href="/matches/new" size="lg" variant="light">
							<CirclePlus className="size-5" aria-hidden="true" /> New match
						</LinkButton>
						<LinkButton
							href="/matches"
							size="lg"
							variant="ghost"
							className="text-white ring-1 ring-white/30 hover:bg-white/10"
						>
							All matches
						</LinkButton>
					</div>
				</div>
				<StumpsArt />
			</section>

			<Suspense fallback={<Skeleton className="h-40" />}>
				<Matches />
			</Suspense>

			<section className="grid gap-4 sm:grid-cols-3">
				<Feature icon={<ClipboardList className="size-5" />} title="Full scorecards">
					Batting, bowling, extras, fall of wickets, partnerships and commentary.
				</Feature>
				<Feature icon={<Undo2 className="size-5" />} title="Fearless undo">
					Tapped the wrong button? Undo restores the exact previous state, and nothing is ever lost.
				</Feature>
				<Feature icon={<Radio className="size-5" />} title="Live for everyone">
					Fans follow the score as it happens, from any phone.
				</Feature>
			</section>
		</div>
	);
}

async function Matches() {
	const { live, upcoming, recent } = await listMatches();
	return (
		<>
			{live.length > 0 && (
				<section>
					<SectionTitle>Live now</SectionTitle>
					<div className="grid gap-4 sm:grid-cols-2">
						{live.slice(0, 6).map((m) => (
							<MatchTile key={m.id} match={m} />
						))}
					</div>
				</section>
			)}
			{upcoming.length > 0 && (
				<section>
					<SectionTitle>Upcoming</SectionTitle>
					<div className="grid gap-4 sm:grid-cols-2">
						{upcoming.slice(0, 4).map((m) => (
							<MatchTile key={m.id} match={m} />
						))}
					</div>
				</section>
			)}
			<section>
				<SectionTitle
					action={
						<LinkButton href="/matches" variant="ghost" size="sm">
							All matches <ArrowRight className="size-4" aria-hidden="true" />
						</LinkButton>
					}
				>
					Recent results
				</SectionTitle>
				{recent.length > 0 ? (
					<div className="grid gap-4 sm:grid-cols-2">
						{recent.slice(0, 4).map((m) => (
							<MatchTile key={m.id} match={m} />
						))}
					</div>
				) : (
					<Card className="flex items-center gap-4 p-5 text-sm text-muted">
						<Trophy className="size-6 shrink-0 text-brand" aria-hidden="true" />
						Finished matches and their results will show up here.
					</Card>
				)}
			</section>
		</>
	);
}

function Feature({
	icon,
	title,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<Card className="p-5">
			<div className="mb-3 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
				{icon}
			</div>
			<h3 className="font-semibold">{title}</h3>
			<p className="mt-1 text-sm text-muted">{children}</p>
		</Card>
	);
}

/** Decorative stumps + ball, hidden on small screens. */
function StumpsArt() {
	return (
		<svg
			viewBox="0 0 200 220"
			aria-hidden="true"
			className="pointer-events-none absolute right-6 bottom-0 hidden h-[88%] text-white/90 md:block"
		>
			<g fill="currentColor" opacity="0.9">
				<rect x="52" y="40" width="14" height="180" rx="7" />
				<rect x="86" y="40" width="14" height="180" rx="7" />
				<rect x="120" y="40" width="14" height="180" rx="7" />
				<rect x="46" y="28" width="44" height="9" rx="4.5" />
				<rect x="96" y="28" width="44" height="9" rx="4.5" transform="rotate(-8 118 32)" />
			</g>
			<circle cx="160" cy="150" r="24" fill="#e23b3b" />
			<path
				d="M146 134c7 6 7 26 0 32M174 134c-7 6-7 26 0 32"
				stroke="#fff"
				strokeOpacity=".75"
				strokeWidth="2"
				fill="none"
			/>
		</svg>
	);
}
