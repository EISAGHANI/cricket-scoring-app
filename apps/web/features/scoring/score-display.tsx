"use client";

import { ArrowLeftRight } from "lucide-react";
import {
	currentOver,
	type BallRecord,
	type BallTone,
	type InningsState,
	type MatchState,
} from "@/lib/cricket/engine";
import { economy, oversText, playerLookup, runRate, strikeRate } from "@/lib/cricket/format";
import type { Match } from "@/lib/cricket/types";
import { Card, TeamBadge, cx } from "@/components/ui";

const TONE: Record<BallTone, string> = {
	dot: "bg-surface-2 text-muted",
	run: "bg-surface text-ink ring-1 ring-line",
	four: "bg-four text-white",
	six: "bg-six text-white",
	extra: "bg-extra/15 text-extra ring-1 ring-extra/30",
	wicket: "bg-wicket text-white",
};

export function BallChip({
	ball,
	size = "md",
	fresh,
}: {
	ball: BallRecord;
	size?: "sm" | "md";
	fresh?: boolean;
}) {
	return (
		<span
			className={cx(
				"tabular inline-grid shrink-0 place-items-center rounded-full font-bold",
				size === "md" ? "size-10 text-sm" : "size-7 text-[11px]",
				TONE[ball.tone],
				fresh && "animate-pop",
			)}
		>
			{ball.label === "0" ? "•" : ball.label}
		</span>
	);
}

export function ScoreHeader({
	match,
	state,
	inn,
}: {
	match: Match;
	state: MatchState;
	inn: InningsState;
}) {
	const team = match.teams[inn.battingTeam];
	const chasing = inn.number === 2 && state.target !== null;
	const need = chasing ? Math.max(0, state.target! - inn.runs) : 0;
	const ballsLeft = state.ballsPerInnings - inn.legalBalls;
	const rrr = chasing && ballsLeft > 0 ? ((need * 6) / ballsLeft).toFixed(2) : null;

	return (
		<section
			aria-label="Score"
			className="pitch relative overflow-hidden rounded-[2rem] p-5 shadow-card sm:p-6"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<TeamBadge name={team.name} color={team.color} label={team.shortName} size={40} />
					<div className="min-w-0">
						<p className="truncate font-semibold">{team.name}</p>
						<p className="text-xs uppercase tracking-wider text-white/70">
							{inn.number === 1 ? "1st" : "2nd"} innings
						</p>
					</div>
				</div>
				{inn.freeHit && (
					<span className="animate-pop rounded-full bg-[#facc15] px-3 py-1 text-xs font-black uppercase tracking-wider text-[#3b2a00]">
						Free hit
					</span>
				)}
			</div>

			<div className="mt-4 flex items-end gap-3" aria-live="polite">
				<p className="tabular font-display text-7xl font-bold leading-none sm:text-8xl">
					{inn.runs}
					<span className="text-white/60">/</span>
					{inn.wickets}
				</p>
				<p className="tabular mb-2 text-lg font-semibold text-white/85">
					{oversText(inn.legalBalls)}
					<span className="text-white/55"> / {match.oversPerInnings} ov</span>
				</p>
			</div>

			<dl className="mt-4 grid grid-cols-3 gap-2 text-center">
				<Stat label="Run rate" value={runRate(inn.runs, inn.legalBalls)} />
				{chasing ? (
					<>
						<Stat label="Target" value={String(state.target)} />
						<Stat label="Req. rate" value={rrr ?? "-"} />
					</>
				) : (
					<>
						<Stat
							label="Partnership"
							value={`${inn.partnership.runs} (${inn.partnership.balls})`}
						/>
						<Stat
							label="Extras"
							value={String(
								inn.extras.wides + inn.extras.noBalls + inn.extras.byes + inn.extras.legByes,
							)}
						/>
					</>
				)}
			</dl>

			{chasing && (
				<p className="mt-4 rounded-2xl bg-black/20 px-4 py-2.5 text-center text-[15px] font-semibold">
					{need > 0 ? (
						<>
							Need <span className="text-[#b8f5cf]">{need}</span> run{need === 1 ? "" : "s"} from{" "}
							<span className="text-[#b8f5cf]">{ballsLeft}</span> ball{ballsLeft === 1 ? "" : "s"}
						</>
					) : (
						"Target reached"
					)}
				</p>
			)}
		</section>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl bg-white/10 px-2 py-2">
			<dt className="text-[10px] font-semibold uppercase tracking-wider text-white/65">{label}</dt>
			<dd className="tabular font-display text-xl font-bold">{value}</dd>
		</div>
	);
}

export function CreaseCard({
	match,
	inn,
	onSwap,
}: {
	match: Match;
	inn: InningsState;
	onSwap?: () => void;
}) {
	const name = playerLookup(match);
	const rows = [inn.strikerId, inn.nonStrikerId].map((id) => ({
		id,
		line: inn.batters.find((b) => b.playerId === id) ?? null,
		onStrike: id !== null && id === inn.strikerId,
	}));
	const bowler = inn.bowlers.find((b) => b.playerId === inn.bowlerId) ?? null;

	return (
		<Card className="overflow-hidden">
			<div className="flex items-center justify-between px-4 pt-3">
				<h2 className="text-xs font-bold uppercase tracking-wider text-muted">At the crease</h2>
				{onSwap && (
					<button
						type="button"
						onClick={onSwap}
						className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"
					>
						<ArrowLeftRight className="size-3.5" aria-hidden="true" /> Swap strike
					</button>
				)}
			</div>
			<table className="w-full text-sm">
				<thead>
					<tr className="text-[11px] uppercase tracking-wider text-muted">
						<th className="px-4 py-1.5 text-left font-semibold">Batter</th>
						<th className="px-1.5 text-right font-semibold">R</th>
						<th className="px-1.5 text-right font-semibold">B</th>
						<th className="hidden px-1.5 text-right font-semibold sm:table-cell">4s</th>
						<th className="hidden px-1.5 text-right font-semibold sm:table-cell">6s</th>
						<th className="pl-1.5 pr-4 text-right font-semibold">SR</th>
					</tr>
				</thead>
				<tbody className="tabular">
					{rows.map(({ id, line, onStrike }, i) => (
						<tr
							key={id ?? `empty-${i}`}
							className={cx("border-t border-line", onStrike && "bg-brand-soft/50")}
						>
							<td className="max-w-0 px-4 py-2.5">
								<span
									className={cx(
										"flex items-center gap-2 truncate",
										onStrike ? "font-bold" : "font-medium",
									)}
								>
									{onStrike && <BatIcon />}
									<span className="truncate">
										{id ? name(id) : <span className="text-muted">Waiting for batter</span>}
									</span>
								</span>
							</td>
							<td className="px-1.5 text-right font-display text-lg font-bold">
								{line?.runs ?? "-"}
							</td>
							<td className="px-1.5 text-right text-muted">{line?.balls ?? "-"}</td>
							<td className="hidden px-1.5 text-right text-muted sm:table-cell">
								{line?.fours ?? "-"}
							</td>
							<td className="hidden px-1.5 text-right text-muted sm:table-cell">
								{line?.sixes ?? "-"}
							</td>
							<td className="pl-1.5 pr-4 text-right text-muted">
								{line ? strikeRate(line.runs, line.balls) : "-"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<div className="flex items-center gap-3 border-t border-line bg-surface-2/60 px-4 py-2.5 text-sm">
				<BallIcon />
				<span className="min-w-0 flex-1 truncate font-semibold">
					{bowler ? name(bowler.playerId) : <span className="text-muted">New over</span>}
				</span>
				{bowler && (
					<span className="tabular text-muted">
						<span className="font-display text-base font-bold text-ink">
							{oversText(bowler.legalBalls)}-{bowler.maidens}-{bowler.runs}-{bowler.wickets}
						</span>
						<span className="ml-2 text-xs">Econ {economy(bowler.runs, bowler.legalBalls)}</span>
					</span>
				)}
			</div>
		</Card>
	);
}

export function OverStrip({ inn, freshCount }: { inn: InningsState; freshCount: number }) {
	const over = currentOver(inn);
	const previous = over ? inn.overs[over.number - 2] : null;
	return (
		<Card className="px-4 py-3">
			<div className="mb-2 flex items-center justify-between text-xs">
				<span className="font-bold uppercase tracking-wider text-muted">
					{over ? `Over ${over.number}` : "First over"}
				</span>
				{previous && (
					<span className="text-muted">
						Last over:{" "}
						<span className="font-semibold text-ink">
							{previous.runs} run{previous.runs === 1 ? "" : "s"}
						</span>
					</span>
				)}
			</div>
			<div className="flex min-h-10 items-center gap-2 overflow-x-auto pb-0.5">
				{over && over.balls.length > 0 ? (
					over.balls.map((b, i) => (
						<BallChip key={i} ball={b} fresh={i === over.balls.length - 1 && freshCount > 0} />
					))
				) : (
					<span className="text-sm text-muted">Waiting for the first ball...</span>
				)}
				{over &&
					Array.from({ length: Math.max(0, 6 - over.legalBalls) }).map((_, i) => (
						<span
							key={`slot-${i}`}
							className="size-10 shrink-0 rounded-full border-2 border-dashed border-line"
							aria-hidden="true"
						/>
					))}
			</div>
		</Card>
	);
}

export function BatIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			className="size-4 shrink-0 text-brand"
			aria-label="on strike"
			role="img"
		>
			<path
				fill="currentColor"
				d="M19.6 2.3a1.6 1.6 0 0 1 2.1 2.1l-3 3a1 1 0 0 1-.2.2l.8.8a1 1 0 0 1 0 1.4l-9.4 9.4a3 3 0 0 1-4.2 0l-1.2-1.2a3 3 0 0 1 0-4.2l9.4-9.4a1 1 0 0 1 1.4 0l.8.8.2-.2z"
			/>
		</svg>
	);
}

function BallIcon() {
	return (
		<svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
			<circle cx="12" cy="12" r="9" fill="var(--wicket)" />
			<path
				d="M8 5.5c2.6 2.4 2.6 10.6 0 13M16 5.5c-2.6 2.4-2.6 10.6 0 13"
				stroke="#fff"
				strokeOpacity=".8"
				strokeWidth="1.2"
				fill="none"
			/>
		</svg>
	);
}
