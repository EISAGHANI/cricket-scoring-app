"use client";

import { ArrowRight, Undo2 } from "lucide-react";
import { useState } from "react";
import { bowlerChoices, yetToBat, type InningsState, type MatchState } from "@/lib/cricket/engine";
import { oversText } from "@/lib/cricket/format";
import type { Id, Match, MatchEvent, Player, TeamIndex } from "@/lib/cricket/types";
import { Button, Card, Choice, TeamBadge, cx } from "@/components/ui";

function PlayerGrid({
	players,
	selected,
	onSelect,
	disabled,
	meta,
}: {
	players: Player[];
	selected?: Id | null;
	onSelect: (id: Id) => void;
	disabled?: (id: Id) => boolean;
	meta?: (id: Id) => React.ReactNode;
}) {
	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{players.map((p) => (
				<Choice
					key={p.id}
					selected={selected === p.id}
					disabled={disabled?.(p.id)}
					onClick={() => onSelect(p.id)}
				>
					<span className="min-w-0 flex-1 truncate">{p.name}</span>
					{meta?.(p.id)}
				</Choice>
			))}
		</div>
	);
}

export function StartInningsPanel({
	match,
	state,
	onStart,
	onUndo,
}: {
	match: Match;
	state: MatchState;
	onStart: (e: Extract<MatchEvent, { type: "startInnings" }>) => void;
	onUndo?: () => void;
}) {
	const number = state.innings.length === 0 ? 1 : 2;
	const batting: TeamIndex =
		number === 1 ? match.battingFirst : ((1 - match.battingFirst) as TeamIndex);
	const bowling = (1 - batting) as TeamIndex;
	const batSquad = match.teams[batting].players;
	const bowlSquad = match.teams[bowling].players;
	const first = state.innings[0];

	const [striker, setStriker] = useState<Id | null>(batSquad[0]?.id ?? null);
	const [nonStriker, setNonStriker] = useState<Id | null>(batSquad[1]?.id ?? null);
	const [bowler, setBowler] = useState<Id | null>(null);
	const [slot, setSlot] = useState<"striker" | "nonStriker">("striker");

	function pickBatter(id: Id) {
		if (slot === "striker") {
			if (id === nonStriker) setNonStriker(striker);
			setStriker(id);
			setSlot("nonStriker");
		} else {
			if (id === striker) setStriker(nonStriker);
			setNonStriker(id);
		}
	}

	const ready = striker && nonStriker && bowler && striker !== nonStriker;
	const ballsTotal = state.ballsPerInnings;

	return (
		<div className="space-y-4">
			{first && state.target !== null && (
				<Card className="pitch border-0 p-5">
					<p className="text-xs font-bold uppercase tracking-wider text-white/70">Innings break</p>
					<p className="mt-1 font-display text-3xl font-bold uppercase tracking-wide">
						{match.teams[first.battingTeam].name} {first.runs}/{first.wickets}
						<span className="ml-2 text-lg text-white/70">({oversText(first.legalBalls)} ov)</span>
					</p>
					<p className="mt-2 text-[15px]">
						<span className="font-semibold">{match.teams[batting].name}</span> need{" "}
						<span className="font-bold text-[#b8f5cf]">{state.target}</span> to win from{" "}
						{ballsTotal} balls
						<span className="text-white/70">
							{" "}
							· RRR {((state.target * 6) / ballsTotal).toFixed(2)}
						</span>
					</p>
				</Card>
			)}

			<Card className="p-5">
				<div className="mb-4 flex items-center gap-3">
					<TeamBadge
						name={match.teams[batting].name}
						color={match.teams[batting].color}
						label={match.teams[batting].shortName}
						size={40}
					/>
					<div>
						<p className="text-xs font-bold uppercase tracking-wider text-muted">
							{number === 1 ? "1st" : "2nd"} innings
						</p>
						<h2 className="font-display text-2xl font-bold uppercase tracking-wide">
							{match.teams[batting].name} to bat
						</h2>
					</div>
				</div>

				<p className="mb-2 text-sm font-semibold">Opening batters</p>
				<div className="mb-3 grid grid-cols-2 gap-2">
					{(["striker", "nonStriker"] as const).map((s) => {
						const id = s === "striker" ? striker : nonStriker;
						return (
							<button
								key={s}
								type="button"
								onClick={() => setSlot(s)}
								aria-pressed={slot === s}
								className={cx(
									"rounded-2xl border-2 px-3 py-2.5 text-left transition",
									slot === s ? "border-brand bg-brand-soft/60" : "border-line",
								)}
							>
								<span className="block text-[11px] font-bold uppercase tracking-wider text-muted">
									{s === "striker" ? "Striker" : "Non-striker"}
								</span>
								<span className="block truncate font-semibold">
									{batSquad.find((p) => p.id === id)?.name ?? "Choose"}
								</span>
							</button>
						);
					})}
				</div>
				<PlayerGrid
					players={batSquad}
					selected={slot === "striker" ? striker : nonStriker}
					onSelect={pickBatter}
					meta={(id) =>
						id === striker ? <Tag>Striker</Tag> : id === nonStriker ? <Tag>Non-striker</Tag> : null
					}
				/>
			</Card>

			<Card className="p-5">
				<div className="mb-3 flex items-center gap-3">
					<TeamBadge
						name={match.teams[bowling].name}
						color={match.teams[bowling].color}
						label={match.teams[bowling].shortName}
						size={32}
					/>
					<p className="text-sm font-semibold">Opening bowler · {match.teams[bowling].name}</p>
				</div>
				<PlayerGrid players={bowlSquad} selected={bowler} onSelect={setBowler} />
			</Card>

			<div className="flex gap-3">
				{onUndo && (
					<Button variant="secondary" size="lg" onClick={onUndo}>
						<Undo2 className="size-5" aria-hidden="true" /> Undo
					</Button>
				)}
				<Button
					size="lg"
					className="flex-1"
					disabled={!ready}
					onClick={() =>
						ready &&
						onStart({
							type: "startInnings",
							strikerId: striker,
							nonStrikerId: nonStriker,
							bowlerId: bowler,
						})
					}
				>
					Start {number === 1 ? "1st" : "2nd"} innings{" "}
					<ArrowRight className="size-5" aria-hidden="true" />
				</Button>
			</div>
		</div>
	);
}

function Tag({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-on-brand">
			{children}
		</span>
	);
}

export function NewBatterPanel({
	match,
	inn,
	onPick,
	onUndo,
}: {
	match: Match;
	inn: InningsState;
	onPick: (id: Id) => void;
	onUndo: () => void;
}) {
	const players = yetToBat(match, inn);
	const last = inn.fallOfWickets[inn.fallOfWickets.length - 1];
	const outName = match.teams[inn.battingTeam].players.find((p) => p.id === last?.playerId)?.name;
	return (
		<Card className="border-wicket/30 p-5">
			<p className="text-xs font-bold uppercase tracking-wider text-wicket">
				Wicket{outName ? ` · ${outName} is out` : ""}
			</p>
			<h2 className="mb-4 font-display text-2xl font-bold uppercase tracking-wide">
				Who&apos;s in next?
			</h2>
			<PlayerGrid players={players} onSelect={onPick} />
			<Button variant="ghost" size="sm" className="mt-4" onClick={onUndo}>
				<Undo2 className="size-4" aria-hidden="true" /> Undo wicket
			</Button>
		</Card>
	);
}

export function NewBowlerPanel({
	match,
	inn,
	onPick,
	onUndo,
}: {
	match: Match;
	inn: InningsState;
	onPick: (id: Id) => void;
	onUndo: () => void;
}) {
	const choices = bowlerChoices(match, inn);
	const overNo = Math.floor(inn.legalBalls / 6) + 1;
	const lastOver = inn.overs[overNo - 2];
	return (
		<Card className="p-5">
			<p className="text-xs font-bold uppercase tracking-wider text-muted">
				End of over {overNo - 1}
				{lastOver &&
					` · ${lastOver.runs} run${lastOver.runs === 1 ? "" : "s"}${lastOver.wickets ? `, ${lastOver.wickets} wkt` : ""}`}
			</p>
			<h2 className="mb-4 font-display text-2xl font-bold uppercase tracking-wide">
				Over {overNo} · who bowls?
			</h2>
			<div className="grid gap-2 sm:grid-cols-2">
				{choices.map(({ player, allowed, line }) => (
					<Choice key={player.id} disabled={!allowed} onClick={() => onPick(player.id)}>
						<span className="min-w-0 flex-1 truncate">{player.name}</span>
						<span className="tabular text-xs text-muted">
							{!allowed
								? "bowled last over"
								: line && line.legalBalls > 0
									? `${oversText(line.legalBalls)}-${line.maidens}-${line.runs}-${line.wickets}`
									: ""}
						</span>
					</Choice>
				))}
			</div>
			<Button variant="ghost" size="sm" className="mt-4" onClick={onUndo}>
				<Undo2 className="size-4" aria-hidden="true" /> Undo last ball
			</Button>
		</Card>
	);
}
