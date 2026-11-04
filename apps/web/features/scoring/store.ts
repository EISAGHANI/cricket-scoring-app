/**
 * The scorer's client store (PHASE_3_PLAN.md Â§4). Each tap is applied with the engine locally
 * first (instant pad), queued, and posted to the event API in order. The server is the
 * authority: on a conflict or a rejection the store resyncs from the server's log.
 */
import {
	RuleViolation,
	appendEvent,
	currentInnings,
	overDue,
	replay,
	resolveLog,
	type MatchEvent,
	type MatchEventType,
	type MatchState,
} from "@cricket/scoring-engine";
import { createStore, type StoreApi } from "zustand/vanilla";
import { uuidv7 } from "@/lib/uuidv7";
import type { OutboxPort } from "./outbox";
import { backoffMs, recoverTail } from "./sync";

export type SyncStatus = "synced" | "saving" | "offline" | "error";

export type PostFailure =
	| { status: number; code: string; error: string; lastSeq?: number }
	| { status: 0; code: "NETWORK"; error: string };

/** How many events one upload carries (the server accepts up to 500). */
const BATCH = 100;

/** How the store talks to the server (fetch in the app, a fake in tests). */
export interface Transport {
	post(event: MatchEvent): Promise<{ ok: true; lastSeq: number } | ({ ok: false } & PostFailure)>;
	/**
	 * Upload several events in order, stopping at the first rejection: how many the server
	 * accepted, and why it stopped. Without it the store posts one event at a time.
	 */
	postBatch?(events: MatchEvent[]): Promise<{ acked: number; failure: PostFailure | null }>;
	/** All events after `after`, following pagination. */
	fetchAfter(after: number): Promise<MatchEvent[]>;
}

export interface StoreOptions {
	/** Durable queue (IndexedDB). Without it the queue lives in memory only. */
	outbox?: OutboxPort;
	/** The unsent tail recovered from the outbox after a reload. */
	recovered?: MatchEvent[];
	/** Test seams for retry scheduling. */
	schedule?: (run: () => void, ms: number) => () => void;
	random?: () => number;
}

async function sendBatch(
	transport: Transport,
	events: MatchEvent[],
): Promise<{ acked: number; failure: PostFailure | null }> {
	if (transport.postBatch) return transport.postBatch(events);
	let acked = 0;
	for (const event of events) {
		const result = await transport.post(event);
		if (!result.ok) return { acked, failure: result };
		acked++;
	}
	return { acked, failure: null };
}

export interface ScoringState {
	log: MatchEvent[];
	state: MatchState;
	/** Applied locally, not yet confirmed by the server. */
	queue: MatchEvent[];
	sync: SyncStatus;
	/** Something the scorer should read (a rejected tap, a resync). */
	message: string | null;
	/** The latest event applied by this device (drives the "Four!" flash). */
	lastApplied: MatchEvent | null;
	record(type: MatchEventType, payload: unknown): boolean;
	undo(): void;
	retry(): void;
	dismiss(): void;
	/** Stop retry timers (the scorer screen unmounted). */
	stop(): void;
	/** Fetch events recorded elsewhere (another scorer) and apply them. */
	pull(): Promise<void>;
}

export type ScoringStore = StoreApi<ScoringState>;

const head = (log: readonly MatchEvent[]) => log.at(-1)?.seq ?? 0;

export function createScoringStore(
	initial: MatchEvent[],
	transport: Transport,
	options: StoreOptions = {},
): ScoringStore {
	const { outbox } = options;
	const schedule =
		options.schedule ??
		((run, ms) => {
			const id = setTimeout(run, ms);
			return () => clearTimeout(id);
		});
	const recovery = recoverTail(initial, options.recovered ?? []);
	let flushing = false;
	let attempts = 0;
	let cancelRetry: (() => void) | null = null;
	const persist = (work: Promise<void> | undefined) => void work?.catch(() => undefined);

	const store = createStore<ScoringState>()((set, get) => {
		/** `track`: the scorer's own tap (shown as "last applied"), not an automatic follow-up. */
		function apply(type: MatchEventType, payload: unknown, track = true): boolean {
			const { log, state } = get();
			const event = { id: uuidv7(), seq: head(log) + 1, type, payload } as MatchEvent;
			try {
				const next = appendEvent(log, state, event);
				persist(outbox?.add(event));
				set((s) => ({
					log: next.log,
					state: next.state,
					queue: [...s.queue, event],
					message: null,
					...(track ? { lastApplied: event } : {}),
				}));
				return true;
			} catch (error) {
				if (error instanceof RuleViolation) {
					set({ message: error.message });
					return false;
				}
				throw error;
			}
		}

		async function resync(reason: string | null) {
			try {
				const log = await transport.fetchAfter(0);
				persist(outbox?.clear());
				set({
					log,
					state: replay(log),
					queue: [],
					sync: "synced",
					message: reason,
					lastApplied: null,
				});
			} catch {
				set({ sync: "offline", message: "Couldn't reach the server. Check your connection." });
			}
		}

		async function flush() {
			if (flushing) return;
			flushing = true;
			try {
				while (get().queue.length > 0) {
					set({ sync: "saving" });
					const batch = get().queue.slice(0, BATCH);
					const { acked, failure } = await sendBatch(transport, batch);
					if (acked > 0) {
						attempts = 0;
						set((s) => ({ queue: s.queue.slice(acked) }));
						persist(outbox?.ack(batch.slice(0, acked).map((e) => e.id)));
					}
					if (failure === null) continue;
					const result = failure;
					if (result.status === 0 || result.status >= 500) {
						set({
							sync: "offline",
							message: "Not saved yet: no connection. We'll keep trying.",
						});
						cancelRetry?.();
						cancelRetry = schedule(
							() => {
								cancelRetry = null;
								void flush();
							},
							backoffMs(attempts++, options.random),
						);
						return;
					}
					if (result.status === 401 || result.status === 403) {
						set({
							sync: "error",
							message: "You're not a scorer for this match (or you were signed out).",
						});
						return;
					}
					// 409 / 422: the server's log differs from ours. It wins.
					const lost = get().queue.length;
					await resync(
						result.code === "SEQ_CONFLICT"
							? `Someone else is scoring this match. ${lost} unsaved entr${lost === 1 ? "y was" : "ies were"} discarded; the score is up to date.`
							: `The server rejected an entry (${result.error}). The score was reloaded.`,
					);
					return;
				}
				set({ sync: "synced" });
			} finally {
				flushing = false;
			}
		}

		return {
			log: recovery.log,
			state: recovery.state,
			queue: recovery.queue,
			sync: "synced",
			message:
				recovery.dropped.length > 0
					? `${recovery.dropped.length} unsaved entr${recovery.dropped.length === 1 ? "y" : "ies"} from before no longer fit the match and ${recovery.dropped.length === 1 ? "was" : "were"} discarded.`
					: null,
			lastApplied: null,

			record(type, payload) {
				if (!apply(type, payload)) return false;
				// The engine requires END_OF_OVER once an over is due; scorers never tap it (ADR-0005 Â§3).
				if (type === "DELIVERY") {
					const inn = currentInnings(get().state);
					if (inn !== null && overDue(inn)) apply("END_OF_OVER", { reason: "NORMAL" }, false);
				}
				void flush();
				return true;
			},

			undo() {
				const target = resolveLog(get().log).at(-1);
				if (target === undefined || target.type === "MATCH_STARTED") return;
				if (!apply("UNDO", { targetId: target.id })) return;
				// An automatic END_OF_OVER goes with the ball that completed the over.
				if (target.type === "END_OF_OVER" && target.payload.reason === "NORMAL") {
					const ball = resolveLog(get().log).at(-1);
					if (ball !== undefined && ball.type === "DELIVERY")
						apply("UNDO", { targetId: ball.id }, false);
				}
				void flush();
			},

			retry() {
				set({ message: null });
				cancelRetry?.();
				cancelRetry = null;
				void flush();
			},

			stop() {
				cancelRetry?.();
				cancelRetry = null;
			},

			dismiss() {
				set({ message: null });
			},

			async pull() {
				if (get().queue.length > 0 || flushing) return;
				try {
					const events = await transport.fetchAfter(head(get().log));
					if (events.length === 0) return;
					const log = [...get().log, ...events];
					set({ log, state: replay(log) });
				} catch {
					// Polling failures are silent; the next poll retries.
				}
			},
		};
	});
	// Clean up the outbox after recovery, then upload whatever tail is left.
	persist(outbox?.ack([...recovery.alreadySaved, ...recovery.dropped].map((e) => e.id)));
	if (recovery.queue.length > 0) store.getState().retry();
	return store;
}

/** Whether undo is possible (anything after MATCH_STARTED). */
export function canUndo(log: readonly MatchEvent[]): boolean {
	const last = resolveLog(log).at(-1);
	return last !== undefined && last.type !== "MATCH_STARTED";
}

/**
 * The fetch transport used by the app. It takes the scoring lock on first use and again if the
 * lease lapsed with nobody else holding it; a lock held by someone else comes back as a 423.
 * (Heartbeats, handoff and the lock UI arrive with PHASE_4_PLAN M6.)
 */
export function httpTransport(matchId: string, deviceId: string): Transport {
	const url = `/api/matches/${matchId}/events`;
	let generation: number | undefined;
	const json = { "Content-Type": "application/json" };

	async function acquire(): Promise<
		{ ok: true } | { ok: false; status: number; code: string; error: string }
	> {
		try {
			const res = await fetch(`/api/matches/${matchId}/lock`, {
				method: "POST",
				headers: json,
				body: JSON.stringify({ action: "acquire", deviceId }),
			});
			const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
			if (res.ok) {
				generation = Number(body.generation);
				return { ok: true };
			}
			return {
				ok: false,
				status: res.status,
				code: String(body.code ?? "ERROR"),
				error: String(body.error ?? res.statusText),
			};
		} catch {
			return { ok: false, status: 0, code: "NETWORK", error: "Network error" };
		}
	}

	const submission = (event: MatchEvent) => ({
		matchId,
		event,
		deviceId,
		clientTimestamp: new Date().toISOString(),
		schemaVersion: 1,
		...(generation === undefined ? {} : { lockGeneration: generation }),
	});

	async function send(event: MatchEvent): Promise<Response> {
		return fetch(url, {
			method: "POST",
			headers: json,
			body: JSON.stringify(submission(event)),
		});
	}

	async function sendMany(events: MatchEvent[]): Promise<Response> {
		return fetch(url, {
			method: "POST",
			headers: json,
			body: JSON.stringify({ submissions: events.map(submission) }),
		});
	}

	return {
		async postBatch(events) {
			try {
				if (generation === undefined) {
					const lock = await acquire();
					if (!lock.ok) return { acked: 0, failure: lock };
				}
				let res = await sendMany(events);
				if (
					res.status === 423 &&
					(
						await res
							.clone()
							.json()
							.catch(() => ({}))
					).code === "LOCK_REQUIRED"
				) {
					const lock = await acquire();
					if (!lock.ok) return { acked: 0, failure: lock };
					res = await sendMany(events);
				}
				const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
				if (!res.ok) {
					return {
						acked: 0,
						failure: {
							status: res.status,
							code: String(body.code ?? "ERROR"),
							error: String(body.error ?? res.statusText),
						},
					};
				}
				const accepted = (body.accepted as unknown[]).length;
				const failed = body.failed as {
					status: number;
					code: string;
					error: string;
					lastSeq?: number;
				} | null;
				return { acked: accepted, failure: failed };
			} catch {
				return { acked: 0, failure: { status: 0, code: "NETWORK", error: "Network error" } };
			}
		},
		async post(event) {
			try {
				if (generation === undefined) {
					const lock = await acquire();
					if (!lock.ok) return lock;
				}
				let res = await send(event);
				if (
					res.status === 423 &&
					(
						await res
							.clone()
							.json()
							.catch(() => ({}))
					).code === "LOCK_REQUIRED"
				) {
					const lock = await acquire();
					if (!lock.ok) return lock;
					res = await send(event);
				}
				const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
				if (res.ok) return { ok: true, lastSeq: Number(body.lastSeq) };
				return {
					ok: false,
					status: res.status,
					code: String(body.code ?? "ERROR"),
					error: String(body.error ?? res.statusText),
					...(typeof body.lastSeq === "number" ? { lastSeq: body.lastSeq } : {}),
				};
			} catch {
				return { ok: false, status: 0, code: "NETWORK", error: "Network error" };
			}
		},
		async fetchAfter(after) {
			const events: MatchEvent[] = [];
			let from = after;
			for (;;) {
				const res = await fetch(`${url}?after=${from}`, { cache: "no-store" });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const page = (await res.json()) as { events: MatchEvent[]; more: boolean };
				events.push(...page.events);
				if (!page.more || page.events.length === 0) return events;
				from = page.events.at(-1)!.seq;
			}
		},
	};
}

/** A stable id for this browser (ball_events.device_id). */
export function deviceId(): string {
	try {
		const key = "cricket:device-id";
		const existing = localStorage.getItem(key);
		if (existing !== null) return existing;
		const id = uuidv7();
		localStorage.setItem(key, id);
		return id;
	} catch {
		return "unknown-device";
	}
}
