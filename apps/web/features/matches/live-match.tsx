"use client";

import { currentInnings, format, replay, type MatchEvent } from "@cricket/scoring-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Segmented, cx } from "@/components/ui";
import { commentary, type CommentaryLine } from "@/features/scoring/commentary";
import { CreaseCard, OverStrip, ScoreHeader } from "@/features/scoring/display";
import { Scorecard } from "@/features/scoring/scorecard-table";

/** Poll interval until Phase 4 replaces polling with sockets (PHASE_3_PLAN Q4). */
const POLL_MS = 5000;

function useLiveLog(matchId: string, initial: MatchEvent[], active: boolean): MatchEvent[] {
	const [log, setLog] = useState(initial);
	const head = useRef(initial.at(-1)?.seq ?? 0);
	useEffect(() => {
		if (!active) return;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;
		const tick = async () => {
			if (document.visibilityState === "visible") {
				try {
					const res = await fetch(`/api/matches/${matchId}/events?after=${head.current}`, {
						cache: "no-store",
					});
					if (res.ok) {
						const page = (await res.json()) as { events: MatchEvent[] };
						const fresh = page.events.filter((e) => e.seq > head.current);
						if (!stopped && fresh.length > 0) {
							head.current = fresh.at(-1)!.seq;
							setLog((l) => [...l, ...fresh]);
						}
					}
				} catch {
					// Offline: try again on the next tick.
				}
			}
			if (!stopped) timer = setTimeout(() => void tick(), POLL_MS);
		};
		timer = setTimeout(() => void tick(), POLL_MS);
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	}, [matchId, active]);
	return log;
}

export function LiveMatch({
	matchId,
	initialLog,
	live,
}: {
	matchId: string;
	initialLog: MatchEvent[];
	live: boolean;
}) {
	const log = useLiveLog(matchId, initialLog, live);
	const state = useMemo(() => replay(log), [log]);
	const lines = useMemo(() => commentary(log), [log]);
	const [tab, setTab] = useState<"live" | "scorecard" | "commentary">("live");
	const inn = currentInnings(state);
	const latest = inn ?? state.innings.at(-1) ?? null;

	if (state.status === "NOT_STARTED") {
		return (
			<Card className="p-5 text-sm text-muted" role="status">
				{live
					? "Waiting for the first ball. This page updates by itself."
					: "Scoring hasn't started yet."}
			</Card>
		);
	}
	const status = state.result !== null ? format.resultText(state, state.result) : null;

	return (
		<div className="space-y-4">
			{status !== null && (
				<Card className="pitch border-0 p-5">
					<p className="text-xs font-bold uppercase tracking-wider text-white/70">Result</p>
					<p className="mt-1 font-display text-3xl font-bold uppercase tracking-wide">{status}</p>
				</Card>
			)}
			<Segmented
				label="View"
				value={tab}
				onChange={setTab}
				options={[
					{ value: "live", label: status === null ? "Live" : "Summary" },
					{ value: "scorecard", label: "Scorecard" },
					{ value: "commentary", label: "Commentary" },
				]}
			/>
			{tab === "live" && (
				<div className="space-y-3">
					{latest !== null && <ScoreHeader state={state} inn={latest} />}
					{inn !== null && <OverStrip state={state} inn={inn} />}
					{inn !== null && <CreaseCard state={state} inn={inn} />}
					{state.innings.length > 1 && (
						<Card className="divide-y divide-line">
							{state.innings.map((i) => (
								<p key={i.index} className="tabular flex justify-between px-4 py-2.5 text-sm">
									<span className="font-semibold">
										{format.teamName(state, i.battingTeamId)}
										{i.kind === "SUPER_OVER" ? " (super over)" : ""}
									</span>
									<span>
										{i.runs}/{i.wickets}{" "}
										<span className="text-muted">({format.formatOvers(state, i)})</span>
									</span>
								</p>
							))}
						</Card>
					)}
					<CommentaryList lines={lines.slice(0, 12)} />
				</div>
			)}
			{tab === "scorecard" && <Scorecard state={state} />}
			{tab === "commentary" && <CommentaryList lines={lines} />}
			{live && state.status === "IN_PROGRESS" && (
				<p className="text-center text-xs text-muted" role="status">
					Updates every few seconds
				</p>
			)}
		</div>
	);
}

const KIND: Record<CommentaryLine["kind"], string> = {
	ball: "",
	four: "border-l-4 border-four",
	six: "border-l-4 border-six",
	wicket: "border-l-4 border-wicket bg-wicket/5",
	over: "bg-surface-2 font-semibold",
	info: "text-muted",
};

export function CommentaryList({ lines }: { lines: CommentaryLine[] }) {
	if (lines.length === 0) return null;
	return (
		<Card className="overflow-hidden">
			<h2 className="px-4 pt-3 text-xs font-bold uppercase tracking-wider text-muted">
				Commentary
			</h2>
			<ol className="mt-2 divide-y divide-line text-sm" aria-label="Ball by ball commentary">
				{lines.map((l) => (
					<li key={l.seq} className={cx("px-4 py-2.5", KIND[l.kind])}>
						{l.text}
					</li>
				))}
			</ol>
		</Card>
	);
}
