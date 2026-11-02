"use client";

import { ArrowLeftRight, Flag, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
import { allowedDismissals, type InningsState } from "@/lib/cricket/engine";
import { DISMISSAL_LABEL, playerLookup } from "@/lib/cricket/format";
import type { BallEvent, DismissalKind, ExtraKind, Id, Match } from "@/lib/cricket/types";
import { Button, Choice, Segmented, Sheet, cx } from "@/components/ui";

type RecordBall = (ball: BallEvent) => void;

const EXTRA_TITLE: { [K in ExtraKind]: string } = {
	wide: "Wide",
	noBall: "No ball",
	bye: "Byes",
	legBye: "Leg byes",
};

export function Keypad({
	match,
	inn,
	onBall,
	onUndo,
	onSwap,
	onEndInnings,
	canUndo,
}: {
	match: Match;
	inn: InningsState;
	onBall: RecordBall;
	onUndo: () => void;
	onSwap: () => void;
	onEndInnings: () => void;
	canUndo: boolean;
}) {
	const [extra, setExtra] = useState<ExtraKind | null>(null);
	const [wicket, setWicket] = useState(false);
	const [more, setMore] = useState(false);
	const [confirmEnd, setConfirmEnd] = useState(false);

	const key =
		"tabular flex h-16 select-none items-center justify-center rounded-2xl font-display text-3xl font-bold shadow-card transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:h-[4.5rem]";

	return (
		<section aria-label="Scoring keypad" className="space-y-3">
			<div className="grid grid-cols-4 gap-2.5">
				{[0, 1, 2, 3].map((r) => (
					<button
						key={r}
						type="button"
						className={cx(key, "bg-surface ring-1 ring-line hover:bg-surface-2")}
						onClick={() => onBall({ type: "ball", runs: r })}
						aria-label={r === 0 ? "Dot ball" : `${r} run${r === 1 ? "" : "s"}`}
					>
						{r === 0 ? "•" : r}
					</button>
				))}
				<button
					type="button"
					className={cx(key, "bg-four text-white hover:opacity-90")}
					onClick={() => onBall({ type: "ball", runs: 4 })}
					aria-label="Four"
				>
					4
				</button>
				<button
					type="button"
					className={cx(key, "bg-six text-white hover:opacity-90")}
					onClick={() => onBall({ type: "ball", runs: 6 })}
					aria-label="Six"
				>
					6
				</button>
				<button
					type="button"
					className={cx(
						key,
						"bg-extra/15 text-2xl text-extra ring-1 ring-extra/30 hover:bg-extra/25",
					)}
					onClick={() => setExtra("wide")}
				>
					Wd
				</button>
				<button
					type="button"
					className={cx(
						key,
						"bg-extra/15 text-2xl text-extra ring-1 ring-extra/30 hover:bg-extra/25",
					)}
					onClick={() => setExtra("noBall")}
				>
					Nb
				</button>
				<button
					type="button"
					className={cx(
						key,
						"bg-extra/15 text-2xl text-extra ring-1 ring-extra/30 hover:bg-extra/25",
					)}
					onClick={() => setExtra("bye")}
				>
					Bye
				</button>
				<button
					type="button"
					className={cx(
						key,
						"bg-extra/15 text-2xl text-extra ring-1 ring-extra/30 hover:bg-extra/25",
					)}
					onClick={() => setExtra("legBye")}
				>
					LB
				</button>
				<button
					type="button"
					className={cx(key, "bg-wicket text-2xl uppercase text-white hover:opacity-90")}
					onClick={() => setWicket(true)}
				>
					Out
				</button>
				<button
					type="button"
					className={cx(key, "bg-ink text-bg hover:opacity-90")}
					onClick={onUndo}
					disabled={!canUndo}
					aria-label="Undo last entry"
				>
					<Undo2 className="size-7" aria-hidden="true" />
				</button>
			</div>

			<div className="flex flex-wrap gap-2">
				<Button variant="secondary" size="sm" onClick={onSwap}>
					<ArrowLeftRight className="size-4" aria-hidden="true" /> Swap strike
				</Button>
				<Button variant="secondary" size="sm" onClick={() => setMore(true)}>
					<Plus className="size-4" aria-hidden="true" /> 5 or 7 runs
				</Button>
				<div className="flex-1" />
				<Button variant="ghost" size="sm" onClick={() => setConfirmEnd(true)}>
					<Flag className="size-4" aria-hidden="true" /> End innings
				</Button>
			</div>

			{extra && (
				<ExtraSheet
					kind={extra}
					onClose={() => setExtra(null)}
					onPick={(ball) => {
						setExtra(null);
						onBall(ball);
					}}
				/>
			)}
			{wicket && (
				<WicketSheet
					match={match}
					inn={inn}
					onClose={() => setWicket(false)}
					onConfirm={(ball) => {
						setWicket(false);
						onBall(ball);
					}}
				/>
			)}
			<Sheet open={more} onClose={() => setMore(false)} title="Other runs">
				<p className="mb-4 text-sm text-muted">For overthrows or all-run boundaries off the bat.</p>
				<div className="grid grid-cols-2 gap-3">
					{[5, 7].map((r) => (
						<button
							key={r}
							type="button"
							className={cx(key, "bg-surface ring-1 ring-line hover:bg-surface-2")}
							onClick={() => {
								setMore(false);
								onBall({ type: "ball", runs: r });
							}}
						>
							{r}
						</button>
					))}
				</div>
			</Sheet>
			<Sheet
				open={confirmEnd}
				onClose={() => setConfirmEnd(false)}
				title="End innings?"
				footer={
					<div className="flex justify-end gap-2">
						<Button variant="secondary" onClick={() => setConfirmEnd(false)}>
							Keep scoring
						</Button>
						<Button
							variant="danger"
							onClick={() => {
								setConfirmEnd(false);
								onEndInnings();
							}}
						>
							End innings
						</Button>
					</div>
				}
			>
				<p className="text-[15px] text-muted">
					Innings end automatically when the side is all out, the overs are up or the target is
					reached. Use this only to close the innings early, for example for rain or a declaration.
					You can undo it.
				</p>
			</Sheet>
		</section>
	);
}

function ExtraSheet({
	kind,
	onClose,
	onPick,
}: {
	kind: ExtraKind;
	onClose: () => void;
	onPick: RecordBall;
}) {
	const options =
		kind === "wide"
			? [0, 1, 2, 3, 4].map((x) => ({
					label: x === 0 ? "Wd" : `Wd +${x}`,
					sub: `${1 + x} run${x === 0 ? "" : "s"}${x === 4 ? " · boundary" : ""}`,
					ball: { type: "ball", runs: 0, extra: "wide", extraRuns: x } as BallEvent,
				}))
			: kind === "noBall"
				? [0, 1, 2, 3, 4, 6].map((x) => ({
						label: x === 0 ? "Nb" : `Nb +${x}`,
						sub: x === 0 ? "1 run" : `${x} off the bat · ${1 + x} total`,
						ball: { type: "ball", runs: x, extra: "noBall" } as BallEvent,
					}))
				: [1, 2, 3, 4].map((x) => ({
						label: `${x}`,
						sub: `${x} ${kind === "bye" ? "bye" : "leg bye"}${x === 1 ? "" : "s"}${x === 4 ? " · boundary" : ""}`,
						ball: { type: "ball", runs: 0, extra: kind, extraRuns: x } as BallEvent,
					}));

	return (
		<Sheet open onClose={onClose} title={EXTRA_TITLE[kind]}>
			<p className="mb-4 text-sm text-muted">
				{kind === "wide" && "One penalty run, plus any runs taken. The ball is bowled again."}
				{kind === "noBall" && "One penalty run plus runs off the bat. The next ball is a free hit."}
				{(kind === "bye" || kind === "legBye") &&
					"Runs taken without the bat - not charged to the bowler."}
			</p>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{options.map((o) => (
					<button
						key={o.label}
						type="button"
						onClick={() => onPick(o.ball)}
						className="flex flex-col items-center justify-center rounded-2xl bg-extra/12 px-3 py-4 text-extra ring-1 ring-extra/30 transition hover:bg-extra/20 active:scale-95"
					>
						<span className="font-display text-3xl font-bold">{o.label}</span>
						<span className="mt-0.5 text-xs font-medium text-muted">{o.sub}</span>
					</button>
				))}
			</div>
		</Sheet>
	);
}

type Delivery = "normal" | ExtraKind;

function WicketSheet({
	match,
	inn,
	onClose,
	onConfirm,
}: {
	match: Match;
	inn: InningsState;
	onClose: () => void;
	onConfirm: RecordBall;
}) {
	const name = playerLookup(match);
	const [delivery, setDelivery] = useState<Delivery>("normal");
	const extra = delivery === "normal" ? undefined : delivery;
	const kinds = allowedDismissals(extra, inn.freeHit);
	const [kind, setKind] = useState<DismissalKind>(kinds[0]);
	const effectiveKind = kinds.includes(kind) ? kind : kinds[0];
	const [outId, setOutId] = useState<Id>(inn.strikerId!);
	const [fielderId, setFielderId] = useState<Id | undefined>();
	const [runs, setRuns] = useState(0);

	const isRunOut = effectiveKind === "runOut";
	const playerOut = isRunOut ? outId : inn.strikerId!;
	const needsFielder = effectiveKind === "caught" || effectiveKind === "stumped" || isRunOut;
	const fielders = match.teams[inn.bowlingTeam].players;
	const runsAllowed = [0, 1, 2, 3];

	function confirm() {
		const r = isRunOut ? runs : 0;
		const offBat = !extra || extra === "noBall";
		onConfirm({
			type: "ball",
			runs: offBat ? r : 0,
			extra,
			extraRuns: offBat ? 0 : r,
			wicket: {
				kind: effectiveKind,
				playerOutId: playerOut,
				fielderId: needsFielder ? fielderId : undefined,
			},
		});
	}

	return (
		<Sheet
			open
			onClose={onClose}
			title="Wicket"
			footer={
				<div className="flex justify-end gap-2">
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="danger" onClick={confirm}>
						Record wicket
					</Button>
				</div>
			}
		>
			<div className="space-y-6">
				{inn.freeHit && (
					<p className="rounded-xl bg-[#facc15]/20 px-3 py-2 text-sm font-medium">
						Free hit: the batter can only be run out.
					</p>
				)}

				<div>
					<p className="mb-2 text-sm font-semibold">Delivery</p>
					<Segmented<Delivery>
						label="Delivery type"
						value={delivery}
						onChange={(d) => {
							setDelivery(d);
							setRuns(0);
						}}
						options={[
							{ value: "normal", label: "Legal" },
							{ value: "wide", label: "Wide" },
							{ value: "noBall", label: "No ball" },
							{ value: "bye", label: "Bye" },
							{ value: "legBye", label: "LB" },
						]}
					/>
				</div>

				<div>
					<p className="mb-2 text-sm font-semibold">How out?</p>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
						{kinds.map((k) => (
							<Choice
								key={k}
								selected={effectiveKind === k}
								onClick={() => setKind(k)}
								className="justify-center"
							>
								{DISMISSAL_LABEL[k]}
							</Choice>
						))}
					</div>
				</div>

				{isRunOut && (
					<div>
						<p className="mb-2 text-sm font-semibold">Who is out?</p>
						<div className="grid grid-cols-2 gap-2">
							{[inn.strikerId!, inn.nonStrikerId!].map((id) => (
								<Choice key={id} selected={outId === id} onClick={() => setOutId(id)}>
									<span className="min-w-0 flex-1 truncate">{name(id)}</span>
									<span className="text-xs text-muted">
										{id === inn.strikerId ? "striker" : "non-striker"}
									</span>
								</Choice>
							))}
						</div>
					</div>
				)}

				{isRunOut && (
					<div>
						<p className="mb-2 text-sm font-semibold">Runs completed before the run out</p>
						<div className="flex gap-2">
							{runsAllowed.map((r) => (
								<Choice
									key={r}
									selected={runs === r}
									onClick={() => setRuns(r)}
									className="min-w-14 justify-center font-display text-xl font-bold"
								>
									{r}
								</Choice>
							))}
						</div>
					</div>
				)}

				{needsFielder && (
					<div>
						<p className="mb-2 text-sm font-semibold">
							{effectiveKind === "caught"
								? "Caught by"
								: effectiveKind === "stumped"
									? "Stumped by"
									: "Fielder"}
							<span className="ml-1 font-normal text-muted">(optional)</span>
						</p>
						<div className="flex flex-wrap gap-2">
							{fielders.map((p) => (
								<button
									key={p.id}
									type="button"
									aria-pressed={fielderId === p.id}
									onClick={() => setFielderId(fielderId === p.id ? undefined : p.id)}
									className={cx(
										"rounded-full border px-3 py-1.5 text-sm font-medium transition",
										fielderId === p.id
											? "border-wicket bg-wicket/10 text-ink"
											: "border-line text-muted hover:border-wicket/40",
									)}
								>
									{p.name}
									{p.id === inn.bowlerId && <span className="ml-1 text-xs">(bowler)</span>}
								</button>
							))}
						</div>
					</div>
				)}

				<p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
					<span className="font-semibold">{name(playerOut)}</span>{" "}
					<span className="text-muted">
						{DISMISSAL_LABEL[effectiveKind].toLowerCase()}
						{extra ? ` off a ${EXTRA_TITLE[extra].toLowerCase().replace(/s$/, "")}` : ""}
						{isRunOut && runs > 0 ? `, ${runs} run${runs === 1 ? "" : "s"} completed` : ""}
					</span>
				</p>
			</div>
		</Sheet>
	);
}
