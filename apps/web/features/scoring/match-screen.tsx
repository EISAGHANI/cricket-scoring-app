"use client";

import { ArrowLeft, MapPin, SearchX, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { matchPhase } from "@/lib/cricket/engine";
import type { BallEvent, MatchEvent } from "@/lib/cricket/types";
import { deleteMatch, recordEvent, undoLastEvent, useDB } from "@/lib/store";
import {
	Button,
	EmptyState,
	LinkButton,
	PageSkeleton,
	Segmented,
	Sheet,
	TeamBadge,
} from "@/components/ui";
import { StatusPill, useMatchState } from "@/features/matches/match-card";
import { Keypad } from "./keypad";
import { NewBatterPanel, NewBowlerPanel, StartInningsPanel } from "./pickers";
import { ResultPanel } from "./result-panel";
import { CreaseCard, OverStrip, ScoreHeader } from "./score-display";
import { Scorecard } from "./scorecard";

type Flash = { text: string; color: string; key: number } | null;

function flashFor(ball: BallEvent): Omit<NonNullable<Flash>, "key"> | null {
	if (ball.wicket) return { text: "Wicket!", color: "var(--wicket)" };
	const offBat = !ball.extra || ball.extra === "noBall" ? ball.runs : 0;
	if (offBat === 6) return { text: "Six!", color: "var(--six)" };
	if (offBat === 4) return { text: "Four!", color: "var(--four)" };
	return null;
}

export function MatchScreen({ id }: { id: string }) {
	const db = useDB();
	const router = useRouter();
	const match = db?.matches.find((m) => m.id === id);
	const state = useMatchState(match);
	const [tab, setTab] = useState<"live" | "scorecard">("live");
	const [error, setError] = useState("");
	const [flash, setFlash] = useState<Flash>(null);
	const [freshCount, setFreshCount] = useState(0);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(() => () => clearTimeout(flashTimer.current), []);

	if (!db) return <PageSkeleton />;
	if (!match || !state)
		return (
			<EmptyState
				icon={<SearchX className="size-8" aria-hidden="true" />}
				title="Match not found"
				action={<LinkButton href="/matches">All matches</LinkButton>}
			>
				It may have been deleted, or it was scored on a different device or browser.
			</EmptyState>
		);

	const phase = matchPhase(state);
	const inn = state.current;

	function record(event: MatchEvent) {
		const err = recordEvent(id, event);
		setError(err ?? "");
		if (err || event.type !== "ball") return;
		setFreshCount((n) => n + 1);
		const f = flashFor(event);
		if (f) {
			setFlash({ ...f, key: Date.now() });
			clearTimeout(flashTimer.current);
			flashTimer.current = setTimeout(() => setFlash(null), 1100);
			if (typeof navigator !== "undefined" && "vibrate" in navigator)
				navigator.vibrate?.(event.wicket ? [40, 60, 40] : 25);
		}
	}

	function undo() {
		setError("");
		undoLastEvent(id);
	}

	const [a, b] = match.teams;

	return (
		<div className="mx-auto max-w-3xl">
			<div className="mb-4 flex items-center gap-2">
				<LinkButton href="/matches" variant="ghost" size="sm" aria-label="Back to matches">
					<ArrowLeft className="size-4" aria-hidden="true" />
				</LinkButton>
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<TeamBadge name={a.name} color={a.color} label={a.shortName} size={28} />
					<span className="truncate font-display text-xl font-bold uppercase tracking-wide">
						{a.shortName} <span className="text-muted">vs</span> {b.shortName}
					</span>
					<TeamBadge name={b.name} color={b.color} label={b.shortName} size={28} />
				</div>
				<StatusPill state={state} />
				<Button
					variant="ghost"
					size="sm"
					aria-label="Delete match"
					onClick={() => setConfirmDelete(true)}
				>
					<Trash2 className="size-4" aria-hidden="true" />
				</Button>
			</div>

			<p className="mb-4 flex flex-wrap items-center gap-x-2 text-sm text-muted">
				<span>
					{a.name} vs {b.name}
				</span>
				<span aria-hidden="true">·</span>
				<span>{match.oversPerInnings} overs</span>
				{match.venue && (
					<>
						<span aria-hidden="true">·</span>
						<span className="inline-flex items-center gap-1">
							<MapPin className="size-3.5" aria-hidden="true" /> {match.venue}
						</span>
					</>
				)}
				<span aria-hidden="true">·</span>
				<span>
					{match.teams[match.toss.winner].shortName} won the toss, chose to {match.toss.decision}
				</span>
			</p>

			<div className="mb-5">
				<Segmented
					label="View"
					value={tab}
					onChange={setTab}
					options={[
						{ value: "live", label: phase === "completed" ? "Summary" : "Live" },
						{ value: "scorecard", label: "Scorecard" },
					]}
				/>
			</div>

			{error && (
				<p
					role="alert"
					className="mb-4 rounded-2xl bg-wicket/10 px-4 py-3 text-sm font-medium text-wicket"
				>
					{error}
				</p>
			)}

			{tab === "scorecard" ? (
				<Scorecard match={match} state={state} />
			) : phase === "completed" ? (
				<ResultPanel
					match={match}
					state={state}
					onShowScorecard={() => setTab("scorecard")}
					onUndo={undo}
				/>
			) : phase === "setup" || phase === "inningsBreak" ? (
				<StartInningsPanel
					key={state.innings.length}
					match={match}
					state={state}
					onStart={record}
					onUndo={match.events.length > 0 ? undo : undefined}
				/>
			) : (
				inn && (
					<div className="space-y-3">
						<ScoreHeader match={match} state={state} inn={inn} />
						<OverStrip inn={inn} freshCount={freshCount} />
						<CreaseCard
							match={match}
							inn={inn}
							onSwap={state.pending ? undefined : () => record({ type: "swapStrike" })}
						/>
						{state.pending?.kind === "newBatter" ? (
							<NewBatterPanel
								match={match}
								inn={inn}
								onPick={(pid) => record({ type: "newBatter", playerId: pid })}
								onUndo={undo}
							/>
						) : state.pending?.kind === "newBowler" ? (
							<NewBowlerPanel
								match={match}
								inn={inn}
								onPick={(pid) => record({ type: "newBowler", playerId: pid })}
								onUndo={undo}
							/>
						) : (
							<Keypad
								match={match}
								inn={inn}
								onBall={record}
								onUndo={undo}
								onSwap={() => record({ type: "swapStrike" })}
								onEndInnings={() => record({ type: "endInnings" })}
								canUndo={match.events.length > 0}
							/>
						)}
					</div>
				)
			)}

			{flash && (
				<div
					key={flash.key}
					aria-hidden="true"
					className="pointer-events-none fixed inset-0 z-50 grid place-items-center"
				>
					<span
						className="animate-pop rounded-[2rem] px-10 py-5 font-display text-7xl font-bold uppercase tracking-wider text-white shadow-2xl sm:text-8xl"
						style={{ background: flash.color }}
					>
						{flash.text}
					</span>
				</div>
			)}
			<p className="sr-only" aria-live="assertive">
				{flash?.text}
			</p>

			<Sheet
				open={confirmDelete}
				onClose={() => setConfirmDelete(false)}
				title="Delete match?"
				footer={
					<div className="flex justify-end gap-2">
						<Button variant="secondary" onClick={() => setConfirmDelete(false)}>
							Cancel
						</Button>
						<Button
							variant="danger"
							onClick={() => {
								deleteMatch(id);
								router.push("/matches");
							}}
						>
							<Trash2 className="size-4" aria-hidden="true" /> Delete
						</Button>
					</div>
				}
			>
				<p className="text-[15px] text-muted">
					This removes {a.name} vs {b.name} and its scorecard from this device. It can&apos;t be
					undone.
				</p>
			</Sheet>
		</div>
	);
}
