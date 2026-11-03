"use client";

import {
	awaiting,
	eligibleBatters,
	eligibleBowlers,
	format,
	nextInnings,
	type InningsState,
	type MatchEventType,
	type MatchResult,
	type MatchStartedEvent,
	type MatchState,
	type PlayerId,
	type StandaloneDismissalKind,
} from "@cricket/scoring-engine";
import { CloudRain, Flag, Play, Trophy, Undo2 } from "lucide-react";
import { useState } from "react";
import { Button, Card, Choice, Segmented, Sheet } from "@/components/ui";

export type RecordEvent = (type: MatchEventType, payload: unknown) => boolean;

const players = (state: MatchState, teamId: string) =>
	Object.values(state.players).filter((p) => p.teamId === teamId && p.role === "XI");

const otherTeamId = (state: MatchState, teamId: string) =>
	state.teams?.find((t) => t.teamId !== teamId)?.teamId ?? "";

function Panel({
	eyebrow,
	title,
	children,
}: {
	eyebrow?: string;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<Card className="space-y-4 p-5">
			<div>
				{eyebrow !== undefined && (
					<p className="text-xs font-bold uppercase tracking-wider text-muted">{eyebrow}</p>
				)}
				<h2 className="font-display text-2xl font-bold uppercase tracking-wide">{title}</h2>
			</div>
			{children}
		</Card>
	);
}

function UndoLink({ onUndo }: { onUndo?: (() => void) | undefined }) {
	if (onUndo === undefined) return null;
	return (
		<Button variant="ghost" size="sm" onClick={onUndo}>
			<Undo2 className="size-4" aria-hidden="true" /> Undo last entry
		</Button>
	);
}

export function StartMatchPanel({
	payload,
	record,
}: {
	payload: MatchStartedEvent["payload"];
	record: RecordEvent;
}) {
	const [home, away] = payload.teams;
	return (
		<Panel eyebrow={payload.rules.format} title="Ready to score">
			<div className="grid gap-3 sm:grid-cols-2">
				{[home, away].map((t) => (
					<div key={t.teamId} className="rounded-2xl bg-surface-2 p-3 text-sm">
						<p className="mb-1 font-semibold">{t.name}</p>
						<p className="text-muted">{t.playingXI.map((p) => p.name).join(", ")}</p>
					</div>
				))}
			</div>
			<Button size="lg" className="w-full" onClick={() => record("MATCH_STARTED", payload)}>
				<Play className="size-5" aria-hidden="true" /> Start scoring
			</Button>
		</Panel>
	);
}

export function TossPanel({ state, record }: { state: MatchState; record: RecordEvent }) {
	const teams = state.teams ?? [];
	const [winner, setWinner] = useState<string | null>(null);
	const [decision, setDecision] = useState<"BAT" | "BOWL">("BAT");
	return (
		<Panel title="Toss">
			<div>
				<p className="mb-2 text-sm font-semibold">Who won the toss?</p>
				<div className="grid grid-cols-2 gap-2">
					{teams.map((t) => (
						<Choice
							key={t.teamId}
							selected={winner === t.teamId}
							onClick={() => setWinner(t.teamId)}
							className="justify-center"
						>
							{t.name}
						</Choice>
					))}
				</div>
			</div>
			<div>
				<p className="mb-2 text-sm font-semibold">They chose to</p>
				<Segmented
					label="Toss decision"
					value={decision}
					onChange={setDecision}
					options={[
						{ value: "BAT", label: "Bat" },
						{ value: "BOWL", label: "Bowl" },
					]}
				/>
			</div>
			<Button
				size="lg"
				className="w-full"
				disabled={winner === null}
				onClick={() => winner !== null && record("TOSS", { winnerTeamId: winner, decision })}
			>
				Record toss
			</Button>
		</Panel>
	);
}

/** Between innings: super over / bowl-out / follow-on decisions, then openers and bowler. */
export function BetweenInningsPanel({
	state,
	record,
	onUndo,
}: {
	state: MatchState;
	record: RecordEvent;
	onUndo?: (() => void) | undefined;
}) {
	const next = awaiting(state);
	const last = state.innings.at(-1);
	return (
		<div className="space-y-4">
			{last !== undefined && (
				<Card className="pitch border-0 p-5">
					<p className="text-xs font-bold uppercase tracking-wider text-white/70">Innings break</p>
					<p className="mt-1 font-display text-3xl font-bold uppercase tracking-wide">
						{format.teamName(state, last.battingTeamId)} {last.runs}/{last.wickets}
						<span className="ml-2 text-lg text-white/70">({format.formatOvers(state, last)})</span>
					</p>
				</Card>
			)}
			{next.includes("SUPER_OVER_STARTED") ? (
				<Panel title="Scores level">
					<p className="text-sm text-muted">The match is tied. Play a super over to decide it.</p>
					<Button
						size="lg"
						className="w-full"
						onClick={() => record("SUPER_OVER_STARTED", { round: state.superOverRound + 1 })}
					>
						Start super over
					</Button>
					<UndoLink onUndo={onUndo} />
				</Panel>
			) : next.includes("BOWL_OUT_RESULT") ? (
				<Panel title="Bowl-out">
					<p className="text-sm text-muted">Record who won the bowl-out.</p>
					<div className="grid grid-cols-2 gap-2">
						{(state.teams ?? []).map((t) => (
							<Button
								key={t.teamId}
								variant="secondary"
								onClick={() => record("BOWL_OUT_RESULT", { winnerTeamId: t.teamId })}
							>
								{t.name}
							</Button>
						))}
					</div>
				</Panel>
			) : next.includes("FOLLOW_ON") ? (
				<Panel title="Follow-on">
					<p className="text-sm text-muted">
						The side batting second is far enough behind to be made to follow on.
					</p>
					<div className="grid grid-cols-2 gap-2">
						<Button onClick={() => record("FOLLOW_ON", { enforced: true })}>Enforce</Button>
						<Button variant="secondary" onClick={() => record("FOLLOW_ON", { enforced: false })}>
							Bat again
						</Button>
					</div>
				</Panel>
			) : next.includes("INNINGS_STARTED") ? (
				<StartInnings key={state.innings.length} state={state} record={record} onUndo={onUndo} />
			) : null}
		</div>
	);
}

function StartInnings({
	state,
	record,
	onUndo,
}: {
	state: MatchState;
	record: RecordEvent;
	onUndo?: (() => void) | undefined;
}) {
	const plan = nextInnings(state);
	const battingTeamId = plan?.battingTeamId ?? "";
	const bowlingTeamId = otherTeamId(state, battingTeamId);
	const batters = players(state, battingTeamId);
	const bowlers = players(state, bowlingTeamId);
	const [striker, setStriker] = useState<PlayerId | null>(batters[0]?.id ?? null);
	const [nonStriker, setNonStriker] = useState<PlayerId | null>(batters[1]?.id ?? null);
	const [bowler, setBowler] = useState<PlayerId | null>(null);
	const [slot, setSlot] = useState<"striker" | "nonStriker">("striker");
	if (plan === null) return null;

	function pick(id: PlayerId) {
		if (slot === "striker") {
			if (id === nonStriker) setNonStriker(striker);
			setStriker(id);
			setSlot("nonStriker");
		} else {
			if (id === striker) setStriker(nonStriker);
			setNonStriker(id);
		}
	}
	const ready =
		striker !== null && nonStriker !== null && bowler !== null && striker !== nonStriker;
	return (
		<Panel
			eyebrow={
				plan.kind === "SUPER_OVER"
					? "Super over"
					: plan.followOn
						? "Following on"
						: `Innings ${state.innings.length + 1}`
			}
			title={`${format.teamName(state, battingTeamId)} to bat`}
		>
			<div className="grid grid-cols-2 gap-2">
				{(["striker", "nonStriker"] as const).map((s) => {
					const id = s === "striker" ? striker : nonStriker;
					return (
						<Choice key={s} selected={slot === s} onClick={() => setSlot(s)}>
							<span className="min-w-0 flex-1">
								<span className="block text-xs text-muted">
									{s === "striker" ? "On strike" : "Non-striker"}
								</span>
								<span className="block truncate font-semibold">
									{id === null ? "—" : format.playerName(state, id)}
								</span>
							</span>
						</Choice>
					);
				})}
			</div>
			<div className="grid gap-2 sm:grid-cols-2" aria-label="Batters">
				{batters.map((p) => (
					<Choice
						key={p.id}
						selected={p.id === striker || p.id === nonStriker}
						onClick={() => pick(p.id)}
					>
						<span className="min-w-0 flex-1 truncate">{p.name}</span>
					</Choice>
				))}
			</div>
			<div>
				<p className="mb-2 text-sm font-semibold">Opening bowler</p>
				<div className="grid gap-2 sm:grid-cols-2">
					{bowlers.map((p) => (
						<Choice key={p.id} selected={bowler === p.id} onClick={() => setBowler(p.id)}>
							<span className="min-w-0 flex-1 truncate">{p.name}</span>
						</Choice>
					))}
				</div>
			</div>
			<Button
				size="lg"
				className="w-full"
				disabled={!ready}
				onClick={() =>
					record("INNINGS_STARTED", {
						battingTeamId,
						strikerId: striker,
						nonStrikerId: nonStriker,
						bowlerId: bowler,
					})
				}
			>
				Start innings
			</Button>
			<UndoLink onUndo={onUndo} />
		</Panel>
	);
}

export function BatterPanel({
	state,
	inn,
	record,
	onUndo,
}: {
	state: MatchState;
	inn: InningsState;
	record: RecordEvent;
	onUndo: () => void;
}) {
	const options = eligibleBatters(state, inn);
	return (
		<Panel eyebrow="Wicket" title="Next batter">
			{options.length === 0 ? (
				<p className="text-sm text-muted">No one is left to bat.</p>
			) : (
				<div className="grid gap-2 sm:grid-cols-2">
					{options.map((id) => (
						<Choice key={id} onClick={() => record("BATTER_IN", { batterId: id })}>
							<span className="min-w-0 flex-1 truncate">{format.playerName(state, id)}</span>
							{inn.batters.some((b) => b.playerId === id) && (
								<span className="text-xs text-muted">returning</span>
							)}
						</Choice>
					))}
				</div>
			)}
			<div className="flex flex-wrap justify-between gap-2">
				<UndoLink onUndo={onUndo} />
				<Button
					variant="ghost"
					size="sm"
					onClick={() => record("INNINGS_ENDED", { reason: "ALL_OUT" })}
				>
					<Flag className="size-4" aria-hidden="true" /> No more batters (all out)
				</Button>
			</div>
		</Panel>
	);
}

const REASON: Record<string, string> = {
	BOWLED_PREVIOUS_OVER: "bowled last over",
	QUOTA_REACHED: "quota used",
	SUSPENDED: "suspended",
	NOT_IN_FIELDING_XI: "not in XI",
	ALREADY_IN_THIS_OVER: "already bowled this over",
	BOWLED_PREVIOUS_SUPER_OVER: "bowled last super over",
};

export function BowlerPanel({
	state,
	inn,
	record,
	onUndo,
	midOver = false,
}: {
	state: MatchState;
	inn: InningsState;
	record: RecordEvent;
	onUndo?: (() => void) | undefined;
	midOver?: boolean;
}) {
	const options = eligibleBowlers(state, inn);
	const figures = (id: string) => {
		const b = inn.bowlers.find((x) => x.playerId === id);
		return b === undefined
			? ""
			: `${format.bowlerOversText(b.legalBalls, inn.ballsPerOver)}-${b.maidens}-${b.runs}-${b.wickets}`;
	};
	return (
		<Panel
			eyebrow={midOver ? "Change bowler" : `Over ${inn.completedOvers + 1}`}
			title={midOver ? "Who finishes the over?" : "Next bowler"}
		>
			<div className="grid gap-2 sm:grid-cols-2">
				{options.map((o) => (
					<Choice
						key={o.playerId}
						disabled={!o.eligible}
						onClick={() =>
							record("BOWLER_CHANGE", {
								bowlerId: o.playerId,
								reason: midOver ? "INJURY" : "NEW_OVER",
							})
						}
					>
						<span className="min-w-0 flex-1 truncate">{format.playerName(state, o.playerId)}</span>
						<span className="tabular text-xs text-muted">
							{o.eligible ? figures(o.playerId) : (REASON[o.reason ?? ""] ?? o.reason)}
						</span>
					</Choice>
				))}
			</div>
			<UndoLink onUndo={onUndo} />
		</Panel>
	);
}

export function InterruptedPanel({
	state,
	record,
	onUndo,
}: {
	state: MatchState;
	record: RecordEvent;
	onUndo: () => void;
}) {
	const limited = state.rules?.inningsPerSide === 1;
	const [overs, setOvers] = useState("");
	return (
		<Panel eyebrow="Play stopped" title="Interrupted">
			{limited && (
				<label className="block">
					<span className="mb-1.5 block text-sm font-semibold">
						Overs per side after the delay (optional)
					</span>
					<input
						type="number"
						inputMode="numeric"
						min={1}
						value={overs}
						onChange={(e) => setOvers(e.target.value)}
						className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4"
					/>
				</label>
			)}
			<Button
				size="lg"
				className="w-full"
				onClick={() =>
					record("PLAY_RESUMED", {
						revisedOvers: overs === "" ? null : Number(overs),
						revisedBowlerMaxOvers: null,
					})
				}
			>
				<Play className="size-5" aria-hidden="true" /> Resume play
			</Button>
			<UndoLink onUndo={onUndo} />
		</Panel>
	);
}

/** The match is over in play; confirm the result (or record one officials decided). */
export function ResultPanel({
	state,
	record,
	onUndo,
}: {
	state: MatchState;
	record: RecordEvent;
	onUndo: () => void;
}) {
	const provisional = state.provisionalResult;
	const options: MatchResult[] = [
		...(state.rules?.inningsPerSide === 2 ? [{ kind: "DRAW" } as const] : []),
		{ kind: "NO_RESULT" },
		{ kind: "ABANDONED" },
	];
	return (
		<Panel
			eyebrow="Match over"
			title={provisional === null ? "Record the result" : format.resultText(state, provisional)}
		>
			{provisional !== null ? (
				<Button
					size="lg"
					className="w-full"
					onClick={() => record("MATCH_RESULT", { result: provisional, override: false })}
				>
					<Trophy className="size-5" aria-hidden="true" /> Confirm result
				</Button>
			) : (
				<div className="grid gap-2 sm:grid-cols-3">
					{options.map((r) => (
						<Button
							key={r.kind}
							variant="secondary"
							onClick={() => record("MATCH_RESULT", { result: r, override: false })}
						>
							{format.resultText(state, r)}
						</Button>
					))}
				</div>
			)}
			<UndoLink onUndo={onUndo} />
		</Panel>
	);
}

type MoreView = "menu" | "retire" | "penalty" | "dismissal" | "interrupt" | "end" | "bowler";

const STANDALONE: { kind: StandaloneDismissalKind; label: string }[] = [
	{ kind: "RUN_OUT", label: "Run out (non-striker backing up)" },
	{ kind: "TIMED_OUT", label: "Timed out" },
	{ kind: "OBSTRUCTING_THE_FIELD", label: "Obstructing the field" },
];

/** Less frequent events: retirements, penalties, interruptions, declarations, ending the match. */
export function MoreSheet({
	open,
	onClose,
	state,
	inn,
	record,
}: {
	open: boolean;
	onClose: () => void;
	state: MatchState;
	inn: InningsState;
	record: RecordEvent;
}) {
	const [view, setView] = useState<MoreView>("menu");
	const close = () => {
		setView("menu");
		onClose();
	};
	const run = (type: MatchEventType, payload: unknown) => {
		if (record(type, payload)) close();
	};
	const atCrease = [inn.strikerId, inn.nonStrikerId].filter((id): id is string => id !== null);
	const midOver =
		inn.currentOver !== null &&
		inn.currentOver.balls.length > 0 &&
		inn.currentOver.legalBalls < inn.ballsPerOver;
	return (
		<Sheet open={open} onClose={close} title="More">
			{view === "menu" && (
				<div className="grid gap-2">
					<Button
						variant="secondary"
						onClick={() => run("SWAP_STRIKE", { reason: "Scorer correction" })}
					>
						Swap strike
					</Button>
					{midOver && (
						<Button variant="secondary" onClick={() => setView("bowler")}>
							Change bowler mid-over
						</Button>
					)}
					<Button variant="secondary" onClick={() => setView("retire")}>
						Batter retires
					</Button>
					<Button variant="secondary" onClick={() => setView("dismissal")}>
						Out without a ball (run out backing up, timed out)
					</Button>
					<Button variant="secondary" onClick={() => setView("penalty")}>
						Penalty runs
					</Button>
					<Button variant="secondary" onClick={() => setView("interrupt")}>
						<CloudRain className="size-4" aria-hidden="true" /> Stop play (rain, light, break)
					</Button>
					{state.rules?.inningsPerSide === 2 && (
						<Button
							variant="secondary"
							onClick={() => run("DECLARATION", { teamId: inn.battingTeamId })}
						>
							{format.teamName(state, inn.battingTeamId)} declare
						</Button>
					)}
					<Button variant="danger" onClick={() => setView("end")}>
						End the match early
					</Button>
				</div>
			)}
			{view === "bowler" && (
				<BowlerPanel
					state={state}
					inn={inn}
					record={(t, p) => {
						const ok = record(t, p);
						if (ok) close();
						return ok;
					}}
					midOver
				/>
			)}
			{view === "retire" && (
				<div className="space-y-3">
					{atCrease.map((id) => (
						<div
							key={id}
							className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 p-3"
						>
							<span className="truncate font-semibold">{format.playerName(state, id)}</span>
							<span className="flex gap-2">
								<Button
									size="sm"
									variant="secondary"
									onClick={() => run("RETIREMENT", { batterId: id, kind: "HURT" })}
								>
									Hurt
								</Button>
								<Button
									size="sm"
									variant="secondary"
									onClick={() => run("RETIREMENT", { batterId: id, kind: "OUT" })}
								>
									Retired out
								</Button>
							</span>
						</div>
					))}
				</div>
			)}
			{view === "dismissal" && (
				<div className="space-y-3">
					{STANDALONE.map((d) => (
						<div key={d.kind}>
							<p className="mb-1.5 text-sm font-semibold">{d.label}</p>
							<div className="flex flex-wrap gap-2">
								{atCrease.map((id) => (
									<Button
										key={id}
										size="sm"
										variant="secondary"
										onClick={() => run("WICKET", { kind: d.kind, batterId: id, fielderIds: [] })}
									>
										{format.playerName(state, id)}
									</Button>
								))}
							</div>
						</div>
					))}
				</div>
			)}
			{view === "penalty" && (
				<div className="grid gap-2 sm:grid-cols-2">
					{(state.teams ?? []).map((t) => (
						<Button
							key={t.teamId}
							variant="secondary"
							onClick={() => run("PENALTY_RUNS", { toTeamId: t.teamId, runs: 5, reason: "" })}
						>
							5 runs to {t.name}
						</Button>
					))}
				</div>
			)}
			{view === "interrupt" && (
				<div className="grid grid-cols-2 gap-2">
					{(["RAIN", "BAD_LIGHT", "LUNCH", "TEA", "STUMPS", "OTHER"] as const).map((k) => (
						<Button key={k} variant="secondary" onClick={() => run("INTERRUPTION", { kind: k })}>
							{k === "BAD_LIGHT" ? "Bad light" : k.charAt(0) + k.slice(1).toLowerCase()}
						</Button>
					))}
				</div>
			)}
			{view === "end" && (
				<div className="space-y-3">
					<p className="text-sm text-muted">
						Use this when play can&apos;t continue. Undo is still possible.
					</p>
					<div className="grid gap-2 sm:grid-cols-2">
						<Button
							variant="secondary"
							onClick={() =>
								run("MATCH_RESULT", { result: { kind: "NO_RESULT" }, override: false })
							}
						>
							No result
						</Button>
						<Button
							variant="secondary"
							onClick={() =>
								run("MATCH_RESULT", { result: { kind: "ABANDONED" }, override: false })
							}
						>
							Abandoned
						</Button>
					</div>
				</div>
			)}
			{view !== "menu" && (
				<Button variant="ghost" size="sm" className="mt-4" onClick={() => setView("menu")}>
					Back
				</Button>
			)}
		</Sheet>
	);
}
