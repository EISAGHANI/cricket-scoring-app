"use client";

import {
	allowedDismissalKinds,
	format,
	type DeliveryDismissalKind,
	type DeliveryExtra,
	type DeliveryPayload,
	type InningsState,
	type MatchState,
	type Point,
} from "@cricket/scoring-engine";
import { MoreHorizontal, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
import { Button, Choice, Segmented, Sheet, cx } from "@/components/ui";

export const DISMISSAL_LABEL: Record<DeliveryDismissalKind, string> = {
	BOWLED: "Bowled",
	CAUGHT: "Caught",
	LBW: "LBW",
	RUN_OUT: "Run out",
	STUMPED: "Stumped",
	HIT_WICKET: "Hit wicket",
	OBSTRUCTING_THE_FIELD: "Obstructing",
	HIT_BALL_TWICE: "Hit twice",
	HANDLED_THE_BALL: "Handled ball",
};

type ExtraKind = DeliveryExtra["kind"];

export const delivery = (p: Partial<DeliveryPayload> = {}): DeliveryPayload => ({
	runs: 0,
	boundary: null,
	overthrow: false,
	extra: null,
	dismissal: null,
	penaltyRuns: 0,
	overMiscount: false,
	detail: null,
	...p,
});

const KEY =
	"tabular flex h-16 select-none items-center justify-center rounded-2xl font-display text-3xl font-bold shadow-card transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40 sm:h-[4.5rem]";
const EXTRA_KEY = cx(KEY, "bg-extra/15 text-2xl text-extra ring-1 ring-extra/30 hover:bg-extra/25");

export function Keypad({
	state,
	inn,
	captureDetail,
	onDelivery,
	onUndo,
	canUndo,
	onMore,
}: {
	state: MatchState;
	inn: InningsState;
	captureDetail: boolean;
	onDelivery: (p: DeliveryPayload) => void;
	onUndo: () => void;
	canUndo: boolean;
	onMore: () => void;
}) {
	const [extra, setExtra] = useState<ExtraKind | null>(null);
	const [wicket, setWicket] = useState(false);
	const [more, setMore] = useState(false);
	const [detailFor, setDetailFor] = useState<DeliveryPayload | null>(null);

	function send(p: DeliveryPayload) {
		if (captureDetail) setDetailFor(p);
		else onDelivery(p);
	}

	return (
		<section aria-label="Scoring keypad" className="space-y-3">
			<div className="grid grid-cols-4 gap-2.5">
				{[0, 1, 2, 3].map((r) => (
					<button
						key={r}
						type="button"
						className={cx(KEY, "bg-surface ring-1 ring-line hover:bg-surface-2")}
						onClick={() => send(delivery({ runs: r }))}
						aria-label={r === 0 ? "Dot ball" : `${r} run${r === 1 ? "" : "s"}`}
					>
						{r === 0 ? "•" : r}
					</button>
				))}
				<button
					type="button"
					className={cx(KEY, "bg-four text-white hover:opacity-90")}
					onClick={() => send(delivery({ boundary: "FOUR" }))}
					aria-label="Four"
				>
					4
				</button>
				<button
					type="button"
					className={cx(KEY, "bg-six text-white hover:opacity-90")}
					onClick={() => send(delivery({ boundary: "SIX" }))}
					aria-label="Six"
				>
					6
				</button>
				<button
					type="button"
					className={EXTRA_KEY}
					onClick={() => setExtra("WIDE")}
					aria-label="Wide"
				>
					Wd
				</button>
				<button
					type="button"
					className={EXTRA_KEY}
					onClick={() => setExtra("NO_BALL")}
					aria-label="No ball"
				>
					Nb
				</button>
				<button
					type="button"
					className={EXTRA_KEY}
					onClick={() => setExtra("BYE")}
					aria-label="Byes"
				>
					Bye
				</button>
				<button
					type="button"
					className={EXTRA_KEY}
					onClick={() => setExtra("LEG_BYE")}
					aria-label="Leg byes"
				>
					LB
				</button>
				<button
					type="button"
					className={cx(KEY, "bg-wicket text-2xl uppercase text-white hover:opacity-90")}
					onClick={() => setWicket(true)}
				>
					Out
				</button>
				<button
					type="button"
					className={cx(KEY, "bg-ink text-bg hover:opacity-90")}
					onClick={onUndo}
					disabled={!canUndo}
					aria-label="Undo last entry"
				>
					<Undo2 className="size-7" aria-hidden="true" />
				</button>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button variant="secondary" size="sm" onClick={() => setMore(true)}>
					<Plus className="size-4" aria-hidden="true" /> 5, 7 or overthrows
				</Button>
				<div className="flex-1" />
				<Button variant="ghost" size="sm" onClick={onMore}>
					<MoreHorizontal className="size-4" aria-hidden="true" /> More
				</Button>
			</div>

			{extra !== null && (
				<ExtraSheet
					kind={extra}
					state={state}
					onClose={() => setExtra(null)}
					onPick={(p) => {
						setExtra(null);
						send(p);
					}}
				/>
			)}
			{wicket && (
				<WicketSheet
					state={state}
					inn={inn}
					onClose={() => setWicket(false)}
					onConfirm={(p) => {
						setWicket(false);
						send(p);
					}}
				/>
			)}
			<RunsSheet
				open={more}
				onClose={() => setMore(false)}
				onPick={(p) => {
					setMore(false);
					send(p);
				}}
			/>
			{detailFor !== null && (
				<DetailSheet
					onClose={() => setDetailFor(null)}
					onDone={(detail) => {
						onDelivery({ ...detailFor, detail });
						setDetailFor(null);
					}}
				/>
			)}
		</section>
	);
}

function RunsSheet({
	open,
	onClose,
	onPick,
}: {
	open: boolean;
	onClose: () => void;
	onPick: (p: DeliveryPayload) => void;
}) {
	return (
		<Sheet open={open} onClose={onClose} title="Other runs">
			<p className="mb-3 text-sm text-muted">
				All-run fives and sevens, or runs plus an overthrow to the boundary.
			</p>
			<div className="grid grid-cols-2 gap-3">
				{[5, 7].map((r) => (
					<button
						key={r}
						type="button"
						className={cx(KEY, "bg-surface ring-1 ring-line hover:bg-surface-2")}
						onClick={() => onPick(delivery({ runs: r }))}
					>
						{r}
					</button>
				))}
			</div>
			<p className="mb-2 mt-5 text-sm font-semibold">
				Overthrow to the boundary (runs completed + 4)
			</p>
			<div className="grid grid-cols-4 gap-2">
				{[0, 1, 2, 3].map((r) => (
					<button
						key={r}
						type="button"
						className="rounded-2xl bg-four/15 py-3 font-display text-xl font-bold text-four ring-1 ring-four/30"
						onClick={() => onPick(delivery({ runs: r, boundary: "FOUR", overthrow: true }))}
						aria-label={`${r} run${r === 1 ? "" : "s"} plus overthrow four`}
					>
						{r}+4
					</button>
				))}
			</div>
		</Sheet>
	);
}

const EXTRA_TITLE: Record<ExtraKind, string> = {
	WIDE: "Wide",
	NO_BALL: "No ball",
	BYE: "Byes",
	LEG_BYE: "Leg byes",
};

function ExtraSheet({
	kind,
	state,
	onClose,
	onPick,
}: {
	kind: ExtraKind;
	state: MatchState;
	onClose: () => void;
	onPick: (p: DeliveryPayload) => void;
}) {
	const rules = state.rules;
	const [from, setFrom] = useState<"BAT" | "BYE" | "LEG_BYE">("BAT");
	const wide = rules?.wideRuns ?? 1;
	const nb = rules?.noBallRuns ?? 1;
	type Option = { label: string; sub: string; payload: DeliveryPayload };
	let options: Option[];
	if (kind === "WIDE") {
		options = [0, 1, 2, 3].map((x) => ({
			label: x === 0 ? "Wd" : `Wd +${x}`,
			sub: `${wide + x} run${wide + x === 1 ? "" : "s"}`,
			payload: delivery({ runs: x, extra: { kind: "WIDE" } }),
		}));
		options.push({
			label: "Wd +4",
			sub: `${wide + 4} runs · boundary`,
			payload: delivery({ boundary: "FOUR", extra: { kind: "WIDE" } }),
		});
	} else if (kind === "NO_BALL") {
		const extra: DeliveryExtra = { kind: "NO_BALL", runsFrom: from };
		options = [0, 1, 2, 3].map((x) => ({
			label: x === 0 ? "Nb" : `Nb +${x}`,
			sub: `${nb + x} total`,
			payload: delivery({ runs: x, extra }),
		}));
		options.push({
			label: "Nb +4",
			sub: `${nb + 4} total · boundary`,
			payload: delivery({ boundary: "FOUR", extra }),
		});
		if (from === "BAT")
			options.push({
				label: "Nb +6",
				sub: `${nb + 6} total`,
				payload: delivery({ boundary: "SIX", extra }),
			});
	} else {
		options = [1, 2, 3].map((x) => ({
			label: String(x),
			sub: `${x} ${kind === "BYE" ? "bye" : "leg bye"}${x === 1 ? "" : "s"}`,
			payload: delivery({ runs: x, extra: { kind } }),
		}));
		options.push({
			label: "4",
			sub: "boundary",
			payload: delivery({ boundary: "FOUR", extra: { kind } }),
		});
	}
	return (
		<Sheet open onClose={onClose} title={EXTRA_TITLE[kind]}>
			<p className="mb-4 text-sm text-muted">
				{kind === "WIDE" &&
					`${wide} run${wide === 1 ? "" : "s"} plus any runs taken. The ball is bowled again.`}
				{kind === "NO_BALL" &&
					`${nb} run${nb === 1 ? "" : "s"} plus the runs taken. The ball is bowled again.`}
				{(kind === "BYE" || kind === "LEG_BYE") &&
					"Runs taken without the bat; not charged to the bowler."}
			</p>
			{kind === "NO_BALL" && (
				<div className="mb-4">
					<Segmented
						label="Runs from"
						value={from}
						onChange={setFrom}
						options={[
							{ value: "BAT", label: "Off the bat" },
							{ value: "BYE", label: "Byes" },
							{ value: "LEG_BYE", label: "Leg byes" },
						]}
					/>
				</div>
			)}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{options.map((o) => (
					<button
						key={o.label}
						type="button"
						onClick={() => onPick(o.payload)}
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

type DeliveryType = "LEGAL" | ExtraKind;

function WicketSheet({
	state,
	inn,
	onClose,
	onConfirm,
}: {
	state: MatchState;
	inn: InningsState;
	onClose: () => void;
	onConfirm: (p: DeliveryPayload) => void;
}) {
	const [type, setType] = useState<DeliveryType>("LEGAL");
	const extraKind = type === "LEGAL" ? null : type;
	const kinds = allowedDismissalKinds(
		extraKind,
		inn.freeHit,
		state.rules?.allowHandledTheBall ?? true,
	);
	const [kind, setKind] = useState<DeliveryDismissalKind>("BOWLED");
	const effective = kinds.includes(kind) ? kind : (kinds[0] ?? "RUN_OUT");
	const striker = inn.strikerId ?? "";
	const [outId, setOutId] = useState(striker);
	const [fielderId, setFielderId] = useState<string | null>(null);
	const [runs, setRuns] = useState(0);
	const eitherEnd =
		effective === "RUN_OUT" ||
		effective === "OBSTRUCTING_THE_FIELD" ||
		effective === "HANDLED_THE_BALL";
	const batterId = eitherEnd ? outId : striker;
	const wantsFielder = effective === "CAUGHT" || effective === "STUMPED" || effective === "RUN_OUT";
	const fielders = Object.values(state.players).filter(
		(p) => p.teamId === inn.bowlingTeamId && p.role !== "REPLACED",
	);
	const bowlerId = inn.currentOver?.bowlerIds.at(-1) ?? null;

	function confirm() {
		const r = eitherEnd ? runs : 0;
		const extra: DeliveryExtra | null =
			extraKind === null
				? null
				: extraKind === "NO_BALL"
					? { kind: "NO_BALL", runsFrom: "BAT" }
					: { kind: extraKind };
		onConfirm(
			delivery({
				runs: r,
				extra,
				dismissal: {
					kind: effective,
					batterId,
					fielderIds: wantsFielder && fielderId !== null ? [fielderId] : [],
					end: null,
					directHit: false,
				},
			}),
		);
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
						Free hit: the batter can&apos;t be out bowled, caught, LBW or stumped.
					</p>
				)}
				<div>
					<p className="mb-2 text-sm font-semibold">Delivery</p>
					<Segmented<DeliveryType>
						label="Delivery type"
						value={type}
						onChange={(t) => {
							setType(t);
							setRuns(0);
						}}
						options={[
							{ value: "LEGAL", label: "Legal" },
							{ value: "WIDE", label: "Wide" },
							{ value: "NO_BALL", label: "No ball" },
							{ value: "BYE", label: "Bye" },
						]}
					/>
				</div>
				<div>
					<p className="mb-2 text-sm font-semibold">How out?</p>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
						{kinds.map((k) => (
							<Choice
								key={k}
								selected={effective === k}
								onClick={() => setKind(k)}
								className="justify-center"
							>
								{DISMISSAL_LABEL[k]}
							</Choice>
						))}
					</div>
				</div>
				{eitherEnd && (
					<>
						<div>
							<p className="mb-2 text-sm font-semibold">Who is out?</p>
							<div className="grid grid-cols-2 gap-2">
								{[inn.strikerId, inn.nonStrikerId]
									.filter((id): id is string => id !== null)
									.map((id) => (
										<Choice key={id} selected={outId === id} onClick={() => setOutId(id)}>
											<span className="min-w-0 flex-1 truncate">
												{format.playerName(state, id)}
											</span>
											<span className="text-xs text-muted">
												{id === inn.strikerId ? "striker" : "non-striker"}
											</span>
										</Choice>
									))}
							</div>
						</div>
						<div>
							<p className="mb-2 text-sm font-semibold">Runs completed before the wicket</p>
							<div className="flex gap-2">
								{[0, 1, 2, 3].map((r) => (
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
					</>
				)}
				{wantsFielder && (
					<div>
						<p className="mb-2 text-sm font-semibold">
							{effective === "CAUGHT"
								? "Caught by"
								: effective === "STUMPED"
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
									onClick={() => setFielderId(fielderId === p.id ? null : p.id)}
									className={cx(
										"rounded-full border px-3 py-1.5 text-sm font-medium transition",
										fielderId === p.id
											? "border-wicket bg-wicket/10 text-ink"
											: "border-line text-muted hover:border-wicket/40",
									)}
								>
									{p.name}
									{p.id === bowlerId && <span className="ml-1 text-xs">(bowler)</span>}
									{p.role === "SUBSTITUTE" && <span className="ml-1 text-xs">(sub)</span>}
								</button>
							))}
						</div>
					</div>
				)}
				<p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
					<span className="font-semibold">{format.playerName(state, batterId)}</span>{" "}
					<span className="text-muted">
						{DISMISSAL_LABEL[effective].toLowerCase()}
						{extraKind === null
							? ""
							: ` off a ${EXTRA_TITLE[extraKind].toLowerCase().replace(/s$/, "")}`}
						{eitherEnd && runs > 0 ? `, ${runs} run${runs === 1 ? "" : "s"} completed` : ""}
					</span>
				</p>
			</div>
		</Sheet>
	);
}

/** Optional shot detail (PHASE_3_PLAN Q2): wagon wheel and pitch map taps, for Phase 5 charts. */
function DetailSheet({
	onClose,
	onDone,
}: {
	onClose: () => void;
	onDone: (d: DeliveryPayload["detail"]) => void;
}) {
	const [wagon, setWagon] = useState<Point | null>(null);
	const [pitch, setPitch] = useState<Point | null>(null);
	const tap = (e: React.MouseEvent<SVGSVGElement>, set: (p: Point) => void) => {
		const r = e.currentTarget.getBoundingClientRect();
		const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
		set({ x: round((e.clientX - r.left) / r.width), y: round((e.clientY - r.top) / r.height) });
	};
	const save = () =>
		onDone(
			wagon === null && pitch === null ? null : { wagon, pitch, shot: null, deliveryType: null },
		);
	return (
		<Sheet
			open
			onClose={onClose}
			title="Shot detail"
			footer={
				<div className="flex justify-end gap-2">
					<Button variant="secondary" onClick={() => onDone(null)}>
						Skip
					</Button>
					<Button onClick={save}>Save ball</Button>
				</div>
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<p className="mb-2 text-sm font-semibold">Where did it go?</p>
					<svg
						viewBox="0 0 100 100"
						className="aspect-square w-full cursor-crosshair touch-none"
						role="img"
						aria-label="Wagon wheel: tap where the ball went"
						onClick={(e) => tap(e, setWagon)}
					>
						<circle cx="50" cy="50" r="49" fill="var(--pitch-2)" />
						<circle
							cx="50"
							cy="50"
							r="30"
							fill="none"
							stroke="white"
							strokeOpacity="0.35"
							strokeDasharray="2 2"
						/>
						<rect x="47" y="40" width="6" height="20" fill="#d9c58a" />
						{wagon !== null && (
							<>
								<line
									x1="50"
									y1="56"
									x2={wagon.x * 100}
									y2={wagon.y * 100}
									stroke="white"
									strokeWidth="1.5"
								/>
								<circle cx={wagon.x * 100} cy={wagon.y * 100} r="2.5" fill="white" />
							</>
						)}
					</svg>
				</div>
				<div>
					<p className="mb-2 text-sm font-semibold">Where did it pitch?</p>
					<svg
						viewBox="0 0 60 100"
						className="mx-auto h-64 cursor-crosshair touch-none"
						role="img"
						aria-label="Pitch map: tap where the ball pitched"
						onClick={(e) => tap(e, setPitch)}
					>
						<rect x="0" y="0" width="60" height="100" fill="#d9c58a" rx="2" />
						<line x1="0" y1="10" x2="60" y2="10" stroke="white" />
						<line x1="0" y1="90" x2="60" y2="90" stroke="white" />
						{pitch !== null && (
							<circle cx={pitch.x * 60} cy={pitch.y * 100} r="3" fill="var(--wicket)" />
						)}
					</svg>
				</div>
			</div>
		</Sheet>
	);
}
