"use client";

import {
	ballsUsed,
	format,
	metrics,
	type BallSummary,
	type InningsState,
	type MatchState,
} from "@cricket/scoring-engine";
import { ArrowLeftRight } from "lucide-react";
import { Card, cx } from "@/components/ui";

type Tone = "dot" | "run" | "four" | "six" | "extra" | "wicket";

const TONE: Record<Tone, string> = {
	dot: "bg-surface-2 text-muted",
	run: "bg-surface text-ink ring-1 ring-line",
	four: "bg-four text-white",
	six: "bg-six text-white",
	extra: "bg-extra/15 text-extra ring-1 ring-extra/30",
	wicket: "bg-wicket text-white",
};

export function toneOf(ball: BallSummary): Tone {
	if (ball.wicket) return "wicket";
	if (/(wd|nb|b|lb)/.test(ball.label)) return "extra";
	if (ball.label === "4") return "four";
	if (ball.label === "6") return "six";
	if (ball.label === "•") return "dot";
	return "run";
}

export function BallChip({
	ball,
	size = "md",
	fresh,
}: {
	ball: BallSummary;
	size?: "sm" | "md";
	fresh?: boolean;
}) {
	return (
		<span
			className={cx(
				"tabular inline-grid shrink-0 place-items-center rounded-full font-bold",
				size === "md" ? "h-10 min-w-10 px-1 text-sm" : "h-7 min-w-7 px-0.5 text-[11px]",
				TONE[toneOf(ball)],
				fresh && "animate-pop",
			)}
		>
			{ball.label}
		</span>
	);
}

export function inningsLabel(state: MatchState, inn: InningsState): string {
	if (inn.kind === "SUPER_OVER")
		return `Super over${(inn.superOverRound ?? 1) > 1 ? ` ${inn.superOverRound}` : ""}`;
	const n = state.innings.filter((i) => i.kind === "REGULAR" && i.index <= inn.index).length;
	const ordinal = ["1st", "2nd", "3rd", "4th"][n - 1] ?? `${n}th`;
	return `${ordinal} innings${inn.followOn ? " (follow-on)" : ""}`;
}

const fixed = (n: number | null) => (n === null ? "–" : n.toFixed(2));

export function ScoreHeader({ state, inn }: { state: MatchState; inn: InningsState }) {
	const team = state.teams?.find((t) => t.teamId === inn.battingTeamId);
	const target = inn.target;
	const need = target === null ? 0 : Math.max(0, target - inn.runs);
	const ballsLeft = inn.maxOvers === null ? null : inn.maxOvers * inn.ballsPerOver - ballsUsed(inn);
	const rrr = metrics.requiredRunRate(inn);
	const partnership = inn.partnerships.at(-1);
	const extras =
		inn.extras.wides +
		inn.extras.noBalls +
		inn.extras.byes +
		inn.extras.legByes +
		inn.extras.penalties;

	return (
		<section
			aria-label="Score"
			className="pitch relative overflow-hidden rounded-[2rem] p-5 shadow-card sm:p-6"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate font-semibold">{team?.name}</p>
					<p className="text-xs uppercase tracking-wider text-white/70">
						{inningsLabel(state, inn)}
					</p>
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
					{format.formatOvers(state, inn)}
					{inn.maxOvers !== null && state.rules?.format !== "HUNDRED" && (
						<span className="text-white/55"> / {inn.maxOvers} ov</span>
					)}
				</p>
			</div>
			<dl className="mt-4 grid grid-cols-3 gap-2 text-center">
				<Stat label="Run rate" value={fixed(metrics.runRate(inn))} />
				{target !== null ? (
					<>
						<Stat label="Target" value={String(target)} />
						<Stat label="Req. rate" value={fixed(rrr)} />
					</>
				) : (
					<>
						<Stat
							label="Partnership"
							value={
								partnership === undefined ? "–" : `${partnership.runs} (${partnership.legalBalls})`
							}
						/>
						<Stat label="Extras" value={String(extras)} />
					</>
				)}
			</dl>
			{target !== null && (
				<p className="mt-4 rounded-2xl bg-black/20 px-4 py-2.5 text-center text-[15px] font-semibold">
					{need > 0 ? (
						<>
							Need <span className="text-[#b8f5cf]">{need}</span> run{need === 1 ? "" : "s"}
							{ballsLeft !== null && (
								<>
									{" "}
									from <span className="text-[#b8f5cf]">{ballsLeft}</span> ball
									{ballsLeft === 1 ? "" : "s"}
								</>
							)}
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

/** This over's balls, or the last over's between overs. */
export function OverStrip({
	state,
	inn,
	freshSeq,
}: {
	state: MatchState;
	inn: InningsState;
	freshSeq?: number | null;
}) {
	const over = inn.currentOver ?? inn.overs.at(-1) ?? null;
	const bowlerId = over?.bowlerIds.at(-1) ?? null;
	return (
		<Card className="px-4 py-3">
			<div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted">
				<span>
					{over === null
						? "First over"
						: inn.currentOver === null
							? `Over ${over.index + 1} (done)`
							: `Over ${over.index + 1}`}
				</span>
				<span className="normal-case tracking-normal">
					{bowlerId === null ? "" : format.playerName(state, bowlerId)}
				</span>
			</div>
			<div className="flex min-h-10 flex-wrap gap-1.5" aria-label="Balls this over">
				{over === null || over.balls.length === 0 ? (
					<span className="text-sm text-muted">No balls yet</span>
				) : (
					over.balls.map((b) => <BallChip key={b.seq} ball={b} fresh={b.seq === freshSeq} />)
				)}
			</div>
		</Card>
	);
}

export function CreaseCard({
	state,
	inn,
	onSwap,
}: {
	state: MatchState;
	inn: InningsState;
	onSwap?: (() => void) | undefined;
}) {
	const ballsPerOver = inn.ballsPerOver;
	const rows = [inn.strikerId, inn.nonStrikerId]
		.filter((id): id is string => id !== null)
		.map((id) => ({
			id,
			line: inn.batters.find((b) => b.playerId === id) ?? null,
			onStrike: id === inn.strikerId,
		}));
	const bowlerId = inn.currentOver?.bowlerIds.at(-1) ?? inn.overs.at(-1)?.bowlerIds.at(-1) ?? null;
	const bowler = inn.bowlers.find((b) => b.playerId === bowlerId) ?? null;
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
					{rows.map(({ id, line, onStrike }) => (
						<tr key={id} className={cx("border-t border-line", onStrike && "bg-brand-soft/50")}>
							<td className="max-w-0 px-4 py-2.5">
								<span className={cx("block truncate", onStrike ? "font-bold" : "font-medium")}>
									{format.playerName(state, id)}
									{onStrike && <span className="sr-only"> (on strike)</span>}
									{onStrike && <span aria-hidden="true"> *</span>}
								</span>
							</td>
							<td className="px-1.5 text-right font-bold">{line?.runs ?? 0}</td>
							<td className="px-1.5 text-right">{line?.balls ?? 0}</td>
							<td className="hidden px-1.5 text-right sm:table-cell">{line?.fours ?? 0}</td>
							<td className="hidden px-1.5 text-right sm:table-cell">{line?.sixes ?? 0}</td>
							<td className="pl-1.5 pr-4 text-right text-muted">
								{line === null ? "–" : fixed1(metrics.strikeRate(line.runs, line.balls))}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{bowler !== null && (
				<div className="tabular flex items-center justify-between border-t border-line px-4 py-2.5 text-sm">
					<span className="truncate font-medium">{format.playerName(state, bowler.playerId)}</span>
					<span className="shrink-0 text-muted">
						{format.bowlerOversText(bowler.legalBalls, ballsPerOver)}-{bowler.maidens}-{bowler.runs}
						-{bowler.wickets}
					</span>
				</div>
			)}
		</Card>
	);
}

const fixed1 = (n: number | null) => (n === null ? "–" : n.toFixed(1));
