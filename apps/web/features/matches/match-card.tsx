"use client";

import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { useMemo } from "react";
import { computeMatchState, matchPhase, type MatchState } from "@/lib/cricket/engine";
import { oversText, relativeDate } from "@/lib/cricket/format";
import type { Match, TeamIndex } from "@/lib/cricket/types";
import { TeamBadge, cx } from "@/components/ui";

export function useMatchState(match: Match | undefined) {
	return useMemo(() => (match ? computeMatchState(match) : null), [match]);
}

export function inningsFor(state: MatchState, team: TeamIndex) {
	return state.innings.find((i) => i.battingTeam === team) ?? null;
}

export function StatusPill({ state }: { state: MatchState }) {
	const phase = matchPhase(state);
	if (phase === "completed")
		return (
			<span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-brand">
				Result
			</span>
		);
	if (phase === "inningsBreak")
		return (
			<span className="rounded-full bg-extra/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-extra">
				Innings break
			</span>
		);
	if (phase === "setup")
		return (
			<span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-muted">
				Not started
			</span>
		);
	return (
		<span className="inline-flex items-center gap-1.5 rounded-full bg-wicket/12 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-wicket">
			<span className="relative flex size-2">
				<span className="absolute inline-flex size-full animate-ping rounded-full bg-wicket opacity-60 motion-reduce:hidden" />
				<span className="relative inline-flex size-2 rounded-full bg-wicket" />
			</span>
			Live
		</span>
	);
}

export function MatchCard({ match }: { match: Match }) {
	const state = useMatchState(match)!;
	const batting = state.current && !state.current.closed ? state.current.battingTeam : null;

	return (
		<Link
			href={`/matches/${match.id}`}
			className="group block rounded-3xl border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand/40"
		>
			<div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted">
				<div className="flex items-center gap-2">
					<StatusPill state={state} />
					<span>{match.oversPerInnings} overs</span>
				</div>
				<span>{relativeDate(match.updatedAt)}</span>
			</div>

			<div className="space-y-2.5">
				{([0, 1] as const).map((t) => {
					const team = match.teams[t];
					const inn = inningsFor(state, t);
					const winner = state.result?.winner === t;
					return (
						<div key={t} className="flex items-center gap-3">
							<TeamBadge name={team.name} color={team.color} label={team.shortName} size={38} />
							<span
								className={cx(
									"min-w-0 flex-1 truncate font-semibold",
									state.result && !winner && state.result.winner !== null && "text-muted",
								)}
							>
								{team.name}
								{batting === t && (
									<span className="ml-1.5 text-brand" aria-label="batting">
										●
									</span>
								)}
							</span>
							{inn ? (
								<span className="tabular font-display text-2xl font-bold">
									{inn.runs}/{inn.wickets}
									<span className="ml-1.5 font-sans text-xs font-medium text-muted">
										({oversText(inn.legalBalls)})
									</span>
								</span>
							) : (
								<span className="text-sm text-muted">Yet to bat</span>
							)}
						</div>
					);
				})}
			</div>

			<div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-sm">
				<span className={cx("truncate", state.result ? "font-semibold text-brand" : "text-muted")}>
					{state.result ? (
						state.result.text
					) : state.target !== null && state.current && !state.current.closed ? (
						`Need ${Math.max(0, state.target - state.current.runs)} off ${state.ballsPerInnings - state.current.legalBalls} balls`
					) : match.venue ? (
						<span className="inline-flex items-center gap-1">
							<MapPin className="size-3.5" aria-hidden="true" />
							{match.venue}
						</span>
					) : (
						`Toss: ${match.teams[match.toss.winner].name}, chose to ${match.toss.decision}`
					)}
				</span>
				<ChevronRight
					className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5"
					aria-hidden="true"
				/>
			</div>
		</Link>
	);
}
