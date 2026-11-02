"use client";

import { useState } from "react";
import type { InningsState, MatchState } from "@/lib/cricket/engine";
import { dismissalText, economy, oversText, playerLookup, strikeRate } from "@/lib/cricket/format";
import type { Match } from "@/lib/cricket/types";
import { Card, Segmented, TeamBadge, cx } from "@/components/ui";
import { BatIcon, BallChip } from "./score-display";

export function Scorecard({ match, state }: { match: Match; state: MatchState }) {
	const [tab, setTab] = useState<string>(String(Math.max(0, state.innings.length - 1)));

	if (state.innings.length === 0)
		return (
			<Card className="p-8 text-center text-muted">
				The scorecard appears once the first ball is bowled.
			</Card>
		);

	const inn = state.innings[Number(tab)] ?? state.innings[0];

	return (
		<div className="space-y-4">
			{state.innings.length > 1 && (
				<Segmented
					label="Innings"
					value={tab}
					onChange={setTab}
					options={state.innings.map((i, idx) => ({
						value: String(idx),
						label: `${match.teams[i.battingTeam].shortName} · ${i.runs}/${i.wickets}`,
					}))}
				/>
			)}
			<InningsCard match={match} inn={inn} />
		</div>
	);
}

function InningsCard({ match, inn }: { match: Match; inn: InningsState }) {
	const name = playerLookup(match);
	const team = match.teams[inn.battingTeam];
	const extrasTotal = inn.extras.wides + inn.extras.noBalls + inn.extras.byes + inn.extras.legByes;
	const batted = new Set(inn.batters.map((b) => b.playerId));
	const dnb = team.players.filter((p) => !batted.has(p.id));
	const atCrease = new Set([inn.strikerId, inn.nonStrikerId]);

	return (
		<div className="space-y-4">
			<Card className="overflow-hidden">
				<div className="flex items-center gap-3 border-b border-line px-4 py-3">
					<TeamBadge name={team.name} color={team.color} label={team.shortName} size={36} />
					<h2 className="min-w-0 flex-1 truncate font-semibold">{team.name}</h2>
					<p className="tabular font-display text-2xl font-bold">
						{inn.runs}/{inn.wickets}
						<span className="ml-1.5 font-sans text-sm font-medium text-muted">
							({oversText(inn.legalBalls)} ov)
						</span>
					</p>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-[11px] uppercase tracking-wider text-muted">
								<th className="px-4 py-2 text-left font-semibold">Batter</th>
								<th className="px-2 text-right font-semibold">R</th>
								<th className="px-2 text-right font-semibold">B</th>
								<th className="hidden px-2 text-right font-semibold sm:table-cell">4s</th>
								<th className="hidden px-2 text-right font-semibold sm:table-cell">6s</th>
								<th className="px-4 text-right font-semibold">SR</th>
							</tr>
						</thead>
						<tbody className="tabular">
							{inn.batters.map((b) => (
								<tr key={b.playerId} className="border-t border-line">
									<td className="px-4 py-2.5">
										<span className="flex items-center gap-1.5 font-semibold">
											{name(b.playerId)}
											{!inn.closed && b.playerId === inn.strikerId && <BatIcon />}
										</span>
										<span
											className={cx(
												"text-xs",
												b.dismissal ? "text-muted" : "font-medium text-brand",
											)}
										>
											{b.dismissal
												? dismissalText(b, name)
												: atCrease.has(b.playerId) && !inn.closed
													? "batting"
													: "not out"}
										</span>
									</td>
									<td className="px-2 text-right font-display text-lg font-bold">{b.runs}</td>
									<td className="px-2 text-right text-muted">{b.balls}</td>
									<td className="hidden px-2 text-right text-muted sm:table-cell">{b.fours}</td>
									<td className="hidden px-2 text-right text-muted sm:table-cell">{b.sixes}</td>
									<td className="px-4 text-right text-muted">{strikeRate(b.runs, b.balls)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<div className="space-y-1.5 border-t border-line bg-surface-2/60 px-4 py-3 text-sm">
					<p className="flex justify-between gap-3">
						<span>
							<span className="font-semibold">Extras</span>{" "}
							<span className="text-muted">
								(wd {inn.extras.wides}, nb {inn.extras.noBalls}, b {inn.extras.byes}, lb{" "}
								{inn.extras.legByes})
							</span>
						</span>
						<span className="tabular font-semibold">{extrasTotal}</span>
					</p>
					<p className="flex justify-between gap-3 font-semibold">
						<span>Total</span>
						<span className="tabular">
							{inn.runs}/{inn.wickets} ({oversText(inn.legalBalls)} ov)
						</span>
					</p>
					{dnb.length > 0 && (
						<p className="text-muted">
							<span className="font-semibold text-ink">
								{inn.closed ? "Did not bat" : "Yet to bat"}:
							</span>{" "}
							{dnb.map((p) => p.name).join(", ")}
						</p>
					)}
					{inn.fallOfWickets.length > 0 && (
						<p className="text-muted">
							<span className="font-semibold text-ink">Fall of wickets:</span>{" "}
							{inn.fallOfWickets
								.map(
									(f) => `${f.runs}-${f.wicket} (${name(f.playerId)}, ${oversText(f.legalBalls)})`,
								)
								.join(" · ")}
						</p>
					)}
				</div>
			</Card>

			<Card className="overflow-hidden">
				<h3 className="border-b border-line px-4 py-3 font-semibold">
					Bowling · <span className="text-muted">{match.teams[inn.bowlingTeam].name}</span>
				</h3>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-[11px] uppercase tracking-wider text-muted">
								<th className="px-4 py-2 text-left font-semibold">Bowler</th>
								<th className="px-2 text-right font-semibold">O</th>
								<th className="px-2 text-right font-semibold">M</th>
								<th className="px-2 text-right font-semibold">R</th>
								<th className="px-2 text-right font-semibold">W</th>
								<th className="px-2 pr-4 text-right font-semibold sm:pr-2">Econ</th>
								<th className="hidden px-4 text-right font-semibold sm:table-cell">Wd/Nb</th>
							</tr>
						</thead>
						<tbody className="tabular">
							{inn.bowlers
								.filter((b) => b.legalBalls > 0 || b.runs > 0 || b.playerId === inn.bowlerId)
								.map((b) => (
									<tr key={b.playerId} className="border-t border-line">
										<td className="px-4 py-2.5 font-semibold">{name(b.playerId)}</td>
										<td className="px-2 text-right">{oversText(b.legalBalls)}</td>
										<td className="px-2 text-right text-muted">{b.maidens}</td>
										<td className="px-2 text-right">{b.runs}</td>
										<td className="px-2 text-right font-display text-lg font-bold">{b.wickets}</td>
										<td className="px-2 pr-4 text-right text-muted sm:pr-2">
											{economy(b.runs, b.legalBalls)}
										</td>
										<td className="hidden px-4 text-right text-muted sm:table-cell">
											{b.wides}/{b.noBalls}
										</td>
									</tr>
								))}
						</tbody>
					</table>
				</div>
			</Card>

			{inn.overs.length > 0 && (
				<Card className="p-4">
					<h3 className="mb-3 font-semibold">Over by over</h3>
					<ol className="space-y-2.5">
						{[...inn.overs].reverse().map((o) => (
							<li key={o.number} className="flex items-center gap-3">
								<span className="tabular w-9 shrink-0 text-right font-display text-lg font-bold text-muted">
									{o.number}
								</span>
								<div className="min-w-0 flex-1">
									<p className="mb-1 truncate text-xs text-muted">{name(o.bowlerId)}</p>
									<div className="flex flex-wrap gap-1.5">
										{o.balls.map((b, i) => (
											<BallChip key={i} ball={b} size="sm" />
										))}
									</div>
								</div>
								<span className="tabular shrink-0 text-sm font-semibold">
									{o.runs}
									<span className="text-muted"> run{o.runs === 1 ? "" : "s"}</span>
								</span>
							</li>
						))}
					</ol>
				</Card>
			)}
		</div>
	);
}
