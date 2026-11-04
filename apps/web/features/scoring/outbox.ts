/**
 * The offline outbox (PHASE_4_PLAN.md §4): every event the scorer records is written to
 * IndexedDB so a reload, crash or dead battery loses nothing. Rows are removed once the server
 * acknowledges them; the server log plus whatever is left here is the scorer's full state.
 */
import type { MatchEvent } from "@cricket/scoring-engine";
import Dexie, { type Table } from "dexie";

export interface OutboxPort {
	/** Persist an event before (or as) it is queued for upload. */
	add(event: MatchEvent): Promise<void>;
	/** The server has the events; forget them. */
	ack(ids: readonly string[]): Promise<void>;
	/** The local tail was discarded (a resync from the server). */
	clear(): Promise<void>;
	/** Everything not yet acknowledged, in `seq` order. */
	unacked(): Promise<MatchEvent[]>;
}

interface Row {
	id: string;
	matchId: string;
	seq: number;
	event: MatchEvent;
	createdAt: number;
}

class OutboxDb extends Dexie {
	events!: Table<Row, string>;
	constructor(name: string, options?: ConstructorParameters<typeof Dexie>[1]) {
		super(name, options);
		this.version(1).stores({ events: "id, [matchId+seq]" });
	}
}

export interface OutboxFactoryOptions {
	/** Test seam: `fake-indexeddb`'s `indexedDB` and `IDBKeyRange`. */
	dexie?: ConstructorParameters<typeof Dexie>[1];
	now?: () => number;
}

/** Whether this browser can persist an outbox (false in some private modes). */
export async function outboxAvailable(options: OutboxFactoryOptions = {}): Promise<boolean> {
	try {
		const db = new OutboxDb("cricket-outbox", options.dexie);
		await db.open();
		db.close();
		return true;
	} catch {
		return false;
	}
}

export function createOutbox(matchId: string, options: OutboxFactoryOptions = {}): OutboxPort {
	const db = new OutboxDb("cricket-outbox", options.dexie);
	const now = options.now ?? Date.now;
	return {
		async add(event) {
			await db.events.put({ id: event.id, matchId, seq: event.seq, event, createdAt: now() });
		},
		async ack(ids) {
			await db.events.bulkDelete([...ids]);
		},
		async clear() {
			await db.events
				.where("[matchId+seq]")
				.between([matchId, Dexie.minKey], [matchId, Dexie.maxKey])
				.delete();
		},
		async unacked() {
			const rows = await db.events
				.where("[matchId+seq]")
				.between([matchId, Dexie.minKey], [matchId, Dexie.maxKey])
				.toArray();
			return rows.map((r) => r.event);
		},
	};
}
