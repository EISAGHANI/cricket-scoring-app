"use client";

import { CirclePlus, ClipboardList, Trophy, Undo2 } from "lucide-react";
import type { MatchState } from "@/lib/cricket/engine";
import { economy, oversText, playerLookup, strikeRate } from "@/lib/cricket/format";
import type { Match } from "@/lib/cricket/types";
import { Button, Card, LinkButton, TeamBadge } from "@/components/ui";

export function ResultPanel({
	match,
	state,
	onShowScorecard,
	onUndo,
}: {
	match: Match;
	state: MatchState;
	onShowScorecard: () => void;
	onUndo: () => void;
}) {
	const name = playerLookup(match);
	const result = state.result!;

	const batters = state.innings
		.flatMap((inn) => inn.batters.map((b) => ({ ...b, team: inn.battingTeam })))
		.filter((b) => b.balls > 0 || b.runs > 0)
		.sort((a, b) => b.runs - a.runs || a.balls - b.balls)
		.slice(0, 3);
	const bowlers = state.innings
		.flatMap((inn) => inn.bowlers.map((b) => ({ ...b, team: inn.bowlingTeam })))
		.filter((b) => b.legalBalls > 0)
		.sort((a, b) => b.wickets - a.wickets || a.runs / a.legalBalls - b.runs / b.legalBalls)
		.slice(0, 3);

	return (
		<div className="space-y-4">
			<section className="pitch relative overflow-hidden rounded-[2rem] p-6 text-center shadow-card sm:p-8">
				<div className="animate-pop mx-auto mb-3 grid size-16 place-items-center rounded-full bg-[#facc15] text-[#3b2a00] shadow-lg">
					<Trophy className="size-8" aria-hidden="true" />
				</div>
				<p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">Result</p>
				<h2 className="mt-1 font-display text-4xl font-bold uppercase leading-tight tracking-wide sm:text-5xl">
					{result.text}
				</h2>
				<div className="mx-auto mt-6 grid max-w-md gap-2 text-left">
					{state.innings.map((inn) => {
						const t = match.teams[inn.battingTeam];
						return (
							<div
								key={inn.number}
								className="flex items-center gap-3 rounded-2xl bg-black/20 px-3 py-2.5"
							>
								<TeamBadge name={t.name} color={t.color} label={t.shortName} size={34} />
								<span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
								<span className="tabular font-display text-2xl font-bold">
									{inn.runs}/{inn.wickets}
									<span className="ml-1.5 font-sans text-xs text-white/70">
										({oversText(inn.legalBalls)})
									</span>
								</span>
							</div>
						);
					})}
				</div>
			</section>

			<div className="grid gap-4 sm:grid-cols-2">
				<Card className="p-4">
					<h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
						Top batters
					</h3>
					<ul className="divide-y divide-line">
						{batters.map((b) => (
							<li
								key={`${b.team}-${b.playerId}`}
								className="flex items-center justify-between gap-3 py-2"
							>
								<span className="min-w-0">
									<span className="block truncate font-semibold">{name(b.playerId)}</span>
									<span className="text-xs text-muted">
										{match.teams[b.team].shortName} · SR {strikeRate(b.runs, b.balls)}
									</span>
								</span>
								<span className="tabular font-display text-xl font-bold">
									{b.runs}
									{!b.dismissal && "*"}
									<span className="ml-1 font-sans text-xs font-medium text-muted">({b.balls})</span>
								</span>
							</li>
						))}
					</ul>
				</Card>
				<Card className="p-4">
					<h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
						Top bowlers
					</h3>
					<ul className="divide-y divide-line">
						{bowlers.map((b) => (
							<li
								key={`${b.team}-${b.playerId}`}
								className="flex items-center justify-between gap-3 py-2"
							>
								<span className="min-w-0">
									<span className="block truncate font-semibold">{name(b.playerId)}</span>
									<span className="text-xs text-muted">
										{match.teams[b.team].shortName} · Econ {economy(b.runs, b.legalBalls)}
									</span>
								</span>
								<span className="tabular font-display text-xl font-bold">
									{b.wickets}-{b.runs}
									<span className="ml-1 font-sans text-xs font-medium text-muted">
										({oversText(b.legalBalls)})
									</span>
								</span>
							</li>
						))}
					</ul>
				</Card>
			</div>

			<div className="flex flex-wrap gap-2">
				<Button onClick={onShowScorecard}>
					<ClipboardList className="size-4" aria-hidden="true" /> Full scorecard
				</Button>
				<LinkButton href="/local/matches/new" variant="secondary">
					<CirclePlus className="size-4" aria-hidden="true" /> New match
				</LinkButton>
				<div className="flex-1" />
				<Button variant="ghost" onClick={onUndo}>
					<Undo2 className="size-4" aria-hidden="true" /> Undo last ball
				</Button>
			</div>
		</div>
	);
}
