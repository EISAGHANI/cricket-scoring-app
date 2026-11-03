"use client";

import { format, metrics, type InningsState, type MatchState } from "@cricket/scoring-engine";
import { Card } from "@/components/ui";
import { inningsLabel } from "./display";

const one = (n: number | null) => (n === null ? "–" : n.toFixed(1));
const two = (n: number | null) => (n === null ? "–" : n.toFixed(2));

/** Full scorecard: batting, extras, total, fall of wickets, bowling and partnerships per innings. */
export function Scorecard({ state }: { state: MatchState }) {
	if (state.innings.length === 0) {
		return <p className="text-sm text-muted">The scorecard appears once play starts.</p>;
	}
	return (
		<div className="space-y-6">
			{state.innings.map((inn) => (
				<InningsCard key={inn.index} state={state} inn={inn} />
			))}
		</div>
	);
}

function InningsCard({ state, inn }: { state: MatchState; inn: InningsState }) {
	const team = format.teamName(state, inn.battingTeamId);
	const e = inn.extras;
	const extras = e.wides + e.noBalls + e.byes + e.legByes + e.penalties;
	const yetToBat = Object.values(state.players).filter(
		(p) =>
			p.teamId === inn.battingTeamId &&
			p.role === "XI" &&
			!inn.batters.some((b) => b.playerId === p.id),
	);
	const captionId = `inn-${inn.index}`;
	return (
		<Card className="overflow-hidden">
			<div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
				<h3 id={captionId} className="font-display text-xl font-bold uppercase tracking-wide">
					{team}{" "}
					<span className="text-sm font-semibold normal-case tracking-normal text-muted">
						{inningsLabel(state, inn)}
					</span>
				</h3>
				<p className="tabular shrink-0 font-display text-xl font-bold">
					{inn.runs}/{inn.wickets}{" "}
					<span className="text-sm text-muted">({format.formatOvers(state, inn)})</span>
				</p>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full text-sm" aria-labelledby={captionId}>
					<thead>
						<tr className="text-[11px] uppercase tracking-wider text-muted">
							<th scope="col" className="px-4 py-2 text-left font-semibold">
								Batter
							</th>
							<th scope="col" className="px-1.5 text-right font-semibold">
								R
							</th>
							<th scope="col" className="px-1.5 text-right font-semibold">
								B
							</th>
							<th scope="col" className="px-1.5 text-right font-semibold">
								4s
							</th>
							<th scope="col" className="px-1.5 text-right font-semibold">
								6s
							</th>
							<th scope="col" className="pl-1.5 pr-4 text-right font-semibold">
								SR
							</th>
						</tr>
					</thead>
					<tbody className="tabular">
						{inn.batters.map((b) => (
							<tr key={b.playerId} className="border-t border-line align-top">
								<th scope="row" className="px-4 py-2 text-left font-normal">
									<span className="block font-semibold">
										{format.playerName(state, b.playerId)}
									</span>
									<span className="block text-xs text-muted">
										{format.dismissalText(state, inn, b)}
									</span>
								</th>
								<td className="px-1.5 py-2 text-right font-bold">{b.runs}</td>
								<td className="px-1.5 py-2 text-right">{b.balls}</td>
								<td className="px-1.5 py-2 text-right">{b.fours}</td>
								<td className="px-1.5 py-2 text-right">{b.sixes}</td>
								<td className="py-2 pl-1.5 pr-4 text-right text-muted">
									{one(metrics.strikeRate(b.runs, b.balls))}
								</td>
							</tr>
						))}
						<tr className="border-t border-line">
							<th scope="row" className="px-4 py-2 text-left font-semibold">
								Extras{" "}
								<span className="text-xs font-normal text-muted">
									(b {e.byes}, lb {e.legByes}, w {e.wides}, nb {e.noBalls}
									{e.penalties > 0 ? `, p ${e.penalties}` : ""})
								</span>
							</th>
							<td className="px-1.5 py-2 text-right font-bold">{extras}</td>
							<td colSpan={4} />
						</tr>
						<tr className="border-t border-line bg-surface-2">
							<th scope="row" className="px-4 py-2 text-left font-bold">
								Total
							</th>
							<td className="px-1.5 py-2 text-right font-bold">{inn.runs}</td>
							<td colSpan={4} className="py-2 pl-1.5 pr-4 text-right text-muted">
								{inn.wickets} wkt{inn.wickets === 1 ? "" : "s"}, {format.formatOvers(state, inn)}
								{state.rules?.format === "HUNDRED" ? "" : " ov"}, RR {two(metrics.runRate(inn))}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			{yetToBat.length > 0 && inn.status === "IN_PROGRESS" && (
				<p className="border-t border-line px-4 py-2 text-xs text-muted">
					<span className="font-semibold text-ink">Yet to bat:</span>{" "}
					{yetToBat.map((p) => p.name).join(", ")}
				</p>
			)}
			{inn.fallOfWickets.length > 0 && (
				<p className="border-t border-line px-4 py-2 text-xs text-muted">
					<span className="font-semibold text-ink">Fall of wickets:</span>{" "}
					{inn.fallOfWickets
						.map(
							(f) =>
								`${f.wicketNo}-${f.runs} (${format.playerName(state, f.batterId)}, ${f.overs} ov)`,
						)
						.join(", ")}
				</p>
			)}
			<div className="overflow-x-auto border-t border-line">
				<table className="w-full text-sm">
					<caption className="sr-only">{team} innings bowling</caption>
					<thead>
						<tr className="text-[11px] uppercase tracking-wider text-muted">
							<th scope="col" className="px-4 py-2 text-left font-semibold">
								Bowler
							</th>
							<th scope="col" className="px-1.5 text-right font-semibold">
								O
							</th>
							<th scope="col" className="px-1.5 text-right font-semibold">
								M
							</th>
							<th scope="col" className="px-1.5 text-right font-semibold">
								R
							</th>
							<th scope="col" className="px-1.5 text-right font-semibold">
								W
							</th>
							<th scope="col" className="pl-1.5 pr-4 text-right font-semibold">
								Econ
							</th>
						</tr>
					</thead>
					<tbody className="tabular">
						{inn.bowlers.map((b) => (
							<tr key={b.playerId} className="border-t border-line">
								<th scope="row" className="px-4 py-2 text-left font-semibold">
									{format.playerName(state, b.playerId)}
									{(b.wides > 0 || b.noBalls > 0) && (
										<span className="ml-1 text-xs font-normal text-muted">
											(
											{[b.wides > 0 ? `${b.wides}w` : "", b.noBalls > 0 ? `${b.noBalls}nb` : ""]
												.filter(Boolean)
												.join(", ")}
											)
										</span>
									)}
								</th>
								<td className="px-1.5 text-right">
									{format.bowlerOversText(b.legalBalls, inn.ballsPerOver)}
								</td>
								<td className="px-1.5 text-right">{b.maidens}</td>
								<td className="px-1.5 text-right">{b.runs}</td>
								<td className="px-1.5 text-right font-bold">{b.wickets}</td>
								<td className="pl-1.5 pr-4 text-right text-muted">
									{two(metrics.economy(b.runs, b.legalBalls, inn.ballsPerOver))}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{inn.partnerships.length > 0 && (
				<div className="border-t border-line px-4 py-3">
					<h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">
						Partnerships
					</h4>
					<ul className="tabular space-y-1 text-sm">
						{inn.partnerships.map((p) => (
							<li key={p.wicketNo} className="flex justify-between gap-3">
								<span className="truncate">
									{p.batterIds
										.filter((id): id is string => id !== null)
										.map((id) => format.playerName(state, id))
										.join(" & ")}
								</span>
								<span className="shrink-0 font-semibold">
									{p.runs} <span className="font-normal text-muted">({p.legalBalls})</span>
								</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</Card>
	);
}
