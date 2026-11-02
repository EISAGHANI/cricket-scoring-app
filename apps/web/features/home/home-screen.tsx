"use client";

import {
	ArrowRight,
	CirclePlus,
	Sparkles,
	Trophy,
	Users,
	WifiOff,
	Undo2,
	ClipboardList,
} from "lucide-react";
import { computeMatchState, matchPhase } from "@/lib/cricket/engine";
import { loadSampleTeams, useDB } from "@/lib/store";
import { Button, Card, LinkButton, PageSkeleton, SectionTitle } from "@/components/ui";
import { MatchCard } from "@/features/matches/match-card";

export function HomeScreen() {
	const db = useDB();
	if (!db) return <PageSkeleton />;

	const withPhase = db.matches.map((m) => ({ m, phase: matchPhase(computeMatchState(m)) }));
	const ongoing = withPhase.filter((x) => x.phase !== "completed").map((x) => x.m);
	const finished = withPhase
		.filter((x) => x.phase === "completed")
		.map((x) => x.m)
		.slice(0, 4);
	const hasTeams = db.teams.length >= 2;

	return (
		<div className="space-y-10">
			<section className="pitch relative overflow-hidden rounded-[2rem] px-6 py-9 shadow-card sm:px-10 sm:py-12">
				<div className="relative z-10 max-w-xl">
					<p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
						<Sparkles className="size-3.5" aria-hidden="true" /> Ball-by-ball cricket scoring
					</p>
					<h1 className="font-display text-5xl font-bold uppercase leading-[0.95] tracking-wide sm:text-6xl">
						Score every ball.
						<br />
						<span className="text-[#b8f5cf]">Keep it simple.</span>
					</h1>
					<p className="mt-4 max-w-md text-[15px] text-white/80">
						Set up teams, score live with one tap per ball, and get a full scorecard and result -
						right in your browser, even without signal at the ground.
					</p>
					<div className="mt-7 flex flex-wrap gap-3">
						<LinkButton href="/matches/new" size="lg" variant="light">
							<CirclePlus className="size-5" aria-hidden="true" /> New match
						</LinkButton>
						<LinkButton
							href="/teams"
							size="lg"
							variant="ghost"
							className="text-white ring-1 ring-white/30 hover:bg-white/10"
						>
							<Users className="size-5" aria-hidden="true" /> Teams
						</LinkButton>
					</div>
				</div>
				<StumpsArt />
			</section>

			{!hasTeams && (
				<Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
					<div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
						<Users className="size-7" aria-hidden="true" />
					</div>
					<div className="flex-1">
						<h2 className="font-display text-2xl font-bold uppercase tracking-wide">
							Start with two teams
						</h2>
						<p className="text-sm text-muted">
							Create your own squads, or load two sample teams to try scoring right away.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button variant="secondary" onClick={loadSampleTeams}>
							<Sparkles className="size-4" aria-hidden="true" /> Load sample teams
						</Button>
						<LinkButton href="/teams">Create team</LinkButton>
					</div>
				</Card>
			)}

			{ongoing.length > 0 && (
				<section>
					<SectionTitle>Continue scoring</SectionTitle>
					<div className="grid gap-4 sm:grid-cols-2">
						{ongoing.map((m) => (
							<MatchCard key={m.id} match={m} />
						))}
					</div>
				</section>
			)}

			<section>
				<SectionTitle
					action={
						db.matches.length > 0 && (
							<LinkButton href="/matches" variant="ghost" size="sm">
								All matches <ArrowRight className="size-4" aria-hidden="true" />
							</LinkButton>
						)
					}
				>
					Recent results
				</SectionTitle>
				{finished.length > 0 ? (
					<div className="grid gap-4 sm:grid-cols-2">
						{finished.map((m) => (
							<MatchCard key={m.id} match={m} />
						))}
					</div>
				) : (
					<Card className="flex items-center gap-4 p-5 text-sm text-muted">
						<Trophy className="size-6 shrink-0 text-brand" aria-hidden="true" />
						Finished matches and their results will show up here.
					</Card>
				)}
			</section>

			<section className="grid gap-4 sm:grid-cols-3">
				<Feature icon={<ClipboardList className="size-5" />} title="Full scorecards">
					Batting, bowling, extras, fall of wickets and over-by-over history.
				</Feature>
				<Feature icon={<Undo2 className="size-5" />} title="Fearless undo">
					Tapped the wrong button? Undo restores the exact previous state.
				</Feature>
				<Feature icon={<WifiOff className="size-5" />} title="Works offline">
					Matches are saved on this device as you score - no account needed.
				</Feature>
			</section>
		</div>
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
