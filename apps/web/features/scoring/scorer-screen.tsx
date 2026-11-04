"use client";

import {
	awaiting,
	currentInnings,
	format,
	needsBatter,
	needsBowler,
	overDue,
	type DeliveryPayload,
	type MatchEvent,
	type MatchStartedEvent,
} from "@cricket/scoring-engine";
import { Check, CloudOff, Loader2, RotateCw, Type, X, Crosshair } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { Button, Card, LinkButton, Segmented, cx } from "@/components/ui";
import { CreaseCard, OverStrip, ScoreHeader } from "./display";
import { Keypad } from "./pad";
import {
	BatterPanel,
	BetweenInningsPanel,
	BowlerPanel,
	InterruptedPanel,
	MoreSheet,
	ResultPanel,
	StartMatchPanel,
	TossPanel,
	type RecordEvent,
} from "./panels";
import { Scorecard } from "./scorecard-table";
import { canUndo, createScoringStore, deviceId, httpTransport, type SyncStatus } from "./store";
import { createOutbox, outboxAvailable, type OutboxPort } from "./outbox";

type Flash = { text: string; color: string; key: number } | null;

function flashFor(event: MatchEvent): Omit<NonNullable<Flash>, "key"> | null {
	if (event.type === "WICKET") return { text: "Wicket!", color: "var(--wicket)" };
	if (event.type !== "DELIVERY") return null;
	const p = event.payload;
	if (p.dismissal !== null) return { text: "Wicket!", color: "var(--wicket)" };
	const offBat = p.extra === null || (p.extra.kind === "NO_BALL" && p.extra.runsFrom === "BAT");
	if (offBat && !p.overthrow && p.boundary === "SIX") return { text: "Six!", color: "var(--six)" };
	if (offBat && !p.overthrow && p.boundary === "FOUR")
		return { text: "Four!", color: "var(--four)" };
	return null;
}

const prefListeners = new Set<() => void>();

function readPreference(key: string): boolean {
	try {
		return localStorage.getItem(key) === "1";
	} catch {
		return false; // Storage unavailable (private mode): default off.
	}
}

/** A per-device preference in localStorage. */
function usePreference(key: string): [boolean, (v: boolean) => void] {
	const value = useSyncExternalStore(
		(onChange) => {
			prefListeners.add(onChange);
			window.addEventListener("storage", onChange);
			return () => {
				prefListeners.delete(onChange);
				window.removeEventListener("storage", onChange);
			};
		},
		() => readPreference(key),
		() => false,
	);
	return [
		value,
		(v) => {
			try {
				localStorage.setItem(key, v ? "1" : "0");
			} catch {
				// Ignore: the toggle simply doesn't persist.
			}
			for (const l of prefListeners) l();
		},
	];
}

/** Keep the screen on while scoring (Screen Wake Lock API, where supported). */
function useWakeLock() {
	useEffect(() => {
		let lock: WakeLockSentinel | null = null;
		const acquire = async () => {
			try {
				if ("wakeLock" in navigator && document.visibilityState === "visible")
					lock = await navigator.wakeLock.request("screen");
			} catch {
				// Denied or unsupported (e.g. low battery): scoring still works.
			}
		};
		void acquire();
		const onVisible = () => void acquire();
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			document.removeEventListener("visibilitychange", onVisible);
			void lock?.release().catch(() => {});
		};
	}, []);
}

export function ScorerScreen(props: {
	matchId: string;
	initialLog: MatchEvent[];
	startPayload: MatchStartedEvent["payload"] | null;
}) {
	const [boot, setBoot] = useState<{ outbox?: OutboxPort; recovered: MatchEvent[] } | null>(null);
	// Read the durable outbox before building the store, so unsent entries survive a reload.
	useEffect(() => {
		let live = true;
		void (async () => {
			let outbox: OutboxPort | undefined;
			let recovered: MatchEvent[] = [];
			try {
				if (await outboxAvailable()) {
					outbox = createOutbox(props.matchId);
					recovered = await outbox.unacked();
				}
			} catch {
				outbox = undefined; // IndexedDB unavailable: online-only scoring still works.
			}
			if (live) setBoot({ ...(outbox ? { outbox } : {}), recovered });
		})();
		return () => {
			live = false;
		};
	}, [props.matchId]);
	if (boot === null) return <p className="p-6 text-sm text-muted">Loading the scorer…</p>;
	return <Pad {...props} {...boot} />;
}

function Pad({
	matchId,
	initialLog,
	startPayload,
	outbox,
	recovered,
}: {
	matchId: string;
	initialLog: MatchEvent[];
	startPayload: MatchStartedEvent["payload"] | null;
	outbox?: OutboxPort;
	recovered: MatchEvent[];
}) {
	const [store] = useState(() =>
		createScoringStore(initialLog, httpTransport(matchId, deviceId()), {
			...(outbox ? { outbox } : {}),
			recovered,
		}),
	);
	const state = useStore(store, (s) => s.state);
	const log = useStore(store, (s) => s.log);
	const sync = useStore(store, (s) => s.sync);
	const queued = useStore(store, (s) => s.queue.length);
	const message = useStore(store, (s) => s.message);
	const lastApplied = useStore(store, (s) => s.lastApplied);
	const { record: recordEvent, undo, retry, dismiss, pull } = store.getState();

	const [tab, setTab] = useState<"score" | "scorecard">("score");
	const [more, setMore] = useState(false);
	const [flash, setFlash] = useState<Flash>(null);
	const [large, setLarge] = usePreference("cricket:scorer-large");
	const [detail, setDetail] = usePreference("cricket:scorer-detail");
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useWakeLock();

	useEffect(() => () => clearTimeout(timer.current), []);

	/** Record a tap, with haptic and visual feedback when it's accepted. */
	const record: RecordEvent = (type, payload) => {
		const ok = recordEvent(type, payload);
		const event = store.getState().lastApplied;
		if (!ok || event === null) return ok;
		const f = flashFor(event);
		if ("vibrate" in navigator) navigator.vibrate?.(f?.text === "Wicket!" ? [40, 60, 40] : 20);
		if (f !== null) {
			setFlash({ ...f, key: Date.now() });
			clearTimeout(timer.current);
			timer.current = setTimeout(() => setFlash(null), 1100);
		}
		return ok;
	};

	// Pick up entries made on another device (Phase 4 replaces this with sockets).
	useEffect(() => {
		const onVisible = () => {
			if (document.visibilityState === "visible") void pull();
		};
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("online", retry);
		return () => {
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("online", retry);
			store.getState().stop();
		};
	}, [pull, retry, store]);

	const inn = currentInnings(state);
	const undoable = canUndo(log);
	const onUndo = undoable ? undo : undefined;
	const freshSeq = lastApplied?.type === "DELIVERY" ? lastApplied.seq : null;

	let body: React.ReactNode;
	if (state.status === "NOT_STARTED") {
		body =
			startPayload === null ? null : <StartMatchPanel payload={startPayload} record={record} />;
	} else if (state.status === "COMPLETE") {
		body = (
			<Card className="pitch border-0 p-5">
				<p className="text-xs font-bold uppercase tracking-wider text-white/70">Result</p>
				<p className="mt-1 font-display text-3xl font-bold uppercase tracking-wide">
					{state.result === null ? "Match over" : format.resultText(state, state.result)}
				</p>
				<div className="mt-4 flex flex-wrap gap-2">
					<LinkButton href={`/matches/${matchId}`} variant="light">
						Match page
					</LinkButton>
					<Button variant="ghost" className="text-white hover:bg-white/10" onClick={undo}>
						Undo result
					</Button>
				</div>
			</Card>
		);
	} else if (state.toss === null) {
		body = <TossPanel state={state} record={record} />;
	} else if (state.interrupted) {
		body = <InterruptedPanel state={state} record={record} onUndo={undo} />;
	} else if (inn === null) {
		const next = awaiting(state);
		const between = next.some(
			(t) =>
				t === "INNINGS_STARTED" ||
				t === "SUPER_OVER_STARTED" ||
				t === "BOWL_OUT_RESULT" ||
				t === "FOLLOW_ON",
		);
		body = between ? (
			<BetweenInningsPanel state={state} record={record} onUndo={onUndo} />
		) : (
			<ResultPanel state={state} record={record} onUndo={undo} />
		);
	} else {
		let action: React.ReactNode;
		if (needsBatter(inn))
			action = <BatterPanel state={state} inn={inn} record={record} onUndo={undo} />;
		else if (overDue(inn))
			action = (
				<Button
					size="lg"
					className="w-full"
					onClick={() => record("END_OF_OVER", { reason: "NORMAL" })}
				>
					End over
				</Button>
			);
		else if (needsBowler(inn))
			action = <BowlerPanel state={state} inn={inn} record={record} onUndo={onUndo} />;
		else
			action = (
				<Keypad
					state={state}
					inn={inn}
					captureDetail={detail}
					onDelivery={(p: DeliveryPayload) => record("DELIVERY", p)}
					onUndo={undo}
					canUndo={undoable}
					onMore={() => setMore(true)}
				/>
			);
		body = (
			<div className="space-y-3">
				<ScoreHeader state={state} inn={inn} />
				<OverStrip state={state} inn={inn} freshSeq={freshSeq} />
				<CreaseCard state={state} inn={inn} />
				{action}
				<MoreSheet
					open={more}
					onClose={() => setMore(false)}
					state={state}
					inn={inn}
					record={record}
				/>
			</div>
		);
	}

	return (
		<div className={cx("mx-auto max-w-3xl", large && "scorer-large")}>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<SyncChip sync={sync} queued={queued} onRetry={retry} />
				<div className="flex-1" />
				<ToggleChip
					on={detail}
					onClick={() => setDetail(!detail)}
					label="Shot detail"
					icon={<Crosshair className="size-4" aria-hidden="true" />}
				/>
				<ToggleChip
					on={large}
					onClick={() => setLarge(!large)}
					label="Large text"
					icon={<Type className="size-4" aria-hidden="true" />}
				/>
			</div>
			{message !== null && (
				<div
					role="alert"
					className="mb-4 flex items-start gap-2 rounded-2xl bg-wicket/10 px-4 py-3 text-sm font-medium text-wicket"
				>
					<p className="flex-1">{message}</p>
					<button
						type="button"
						onClick={dismiss}
						aria-label="Dismiss"
						className="rounded-full p-0.5 hover:bg-wicket/10"
					>
						<X className="size-4" />
					</button>
				</div>
			)}
			{state.status !== "NOT_STARTED" && (
				<div className="mb-4">
					<Segmented
						label="View"
						value={tab}
						onChange={setTab}
						options={[
							{ value: "score", label: "Score" },
							{ value: "scorecard", label: "Scorecard" },
						]}
					/>
				</div>
			)}
			{tab === "scorecard" ? <Scorecard state={state} /> : body}
			{flash !== null && (
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
		</div>
	);
}

function SyncChip({
	sync,
	queued,
	onRetry,
}: {
	sync: SyncStatus;
	queued: number;
	onRetry: () => void;
}) {
	if (sync === "saving")
		return (
			<span
				role="status"
				className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted"
			>
				<Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Saving…
			</span>
		);
	if (sync === "offline" || sync === "error")
		return (
			<button
				type="button"
				onClick={onRetry}
				className="inline-flex items-center gap-1.5 rounded-full bg-wicket/10 px-3 py-1 text-xs font-semibold text-wicket"
			>
				<CloudOff className="size-3.5" aria-hidden="true" /> {queued} not saved · Retry
				<RotateCw className="size-3.5" aria-hidden="true" />
			</button>
		);
	return (
		<span
			role="status"
			className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand"
		>
			<Check className="size-3.5" aria-hidden="true" /> Saved
		</span>
	);
}

function ToggleChip({
	on,
	onClick,
	label,
	icon,
}: {
	on: boolean;
	onClick: () => void;
	label: string;
	icon: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-pressed={on}
			onClick={onClick}
			className={cx(
				"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition",
				on ? "border-brand bg-brand-soft text-ink" : "border-line text-muted hover:border-brand/40",
			)}
		>
			{icon} {label}
		</button>
	);
}
