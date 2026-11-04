import { PRESETS, type MatchEvent } from "@cricket/scoring-engine";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createOutbox, outboxAvailable } from "./outbox";
import { createScoringStore, type Transport } from "./store";
import { backoffMs, recoverTail } from "./sync";

const rules = {
	...PRESETS.T20,
	oversPerInnings: 2,
	playersPerSide: 3,
	powerplays: [],
	superOverWickets: 2,
};
const sheet = (teamId: string, ids: string[]) => ({
	teamId,
	name: teamId,
	shortName: teamId,
	playingXI: ids.map((id) => ({ id, name: id })),
	substitutes: [],
	captainId: ids[0]!,
	wicketKeeperId: ids[1]!,
});
const opening: MatchEvent[] = [
	{
		id: "e1",
		seq: 1,
		type: "MATCH_STARTED",
		payload: { rules, teams: [sheet("H", ["a", "b", "c"]), sheet("A", ["d", "e", "f"])] },
	},
	{ id: "e2", seq: 2, type: "TOSS", payload: { winnerTeamId: "H", decision: "BAT" } },
	{
		id: "e3",
		seq: 3,
		type: "INNINGS_STARTED",
		payload: { battingTeamId: "H", strikerId: "a", nonStrikerId: "b", bowlerId: "d" },
	},
];
const ball = (runs = 0) => ({
	runs,
	boundary: null,
	overthrow: false,
	extra: null,
	dismissal: null,
	penaltyRuns: 0,
	overMiscount: false,
	detail: null,
});
const delivery = (seq: number): MatchEvent => ({
	id: `d${seq}`,
	seq,
	type: "DELIVERY",
	payload: ball(1),
});

const fresh = () => ({ dexie: { indexedDB: new IDBFactory(), IDBKeyRange } });
const settle = () => new Promise((r) => setTimeout(r, 5));

describe("outbox", () => {
	it("keeps events in seq order and forgets them once acknowledged", async () => {
		const outbox = createOutbox("m1", fresh());
		await outbox.add(delivery(5));
		await outbox.add(delivery(4));
		await outbox.add(delivery(4)); // the same id again: still one row
		expect((await outbox.unacked()).map((e) => e.seq)).toEqual([4, 5]);
		await outbox.ack(["d4"]);
		expect((await outbox.unacked()).map((e) => e.id)).toEqual(["d5"]);
		await outbox.clear();
		expect(await outbox.unacked()).toEqual([]);
	});

	it("is reported unavailable when IndexedDB isn't there", async () => {
		expect(await outboxAvailable(fresh())).toBe(true);
		expect(await outboxAvailable({ dexie: { indexedDB: undefined } })).toBe(false);
	});
});

describe("backoffMs", () => {
	it("grows exponentially with jitter and caps at 30 s", () => {
		expect(backoffMs(0, () => 1)).toBe(1000);
		expect(backoffMs(0, () => 0)).toBe(500);
		expect(backoffMs(3, () => 1)).toBe(8000);
		expect(backoffMs(20, () => 1)).toBe(30_000);
	});
});

describe("recoverTail", () => {
	it("skips what the server has, keeps what continues the log, drops the rest", () => {
		const server = [...opening, delivery(4)];
		const r = recoverTail(server, [delivery(4), delivery(5), delivery(7), delivery(8)]);
		expect(r.alreadySaved.map((e) => e.id)).toEqual(["d4"]);
		expect(r.queue.map((e) => e.id)).toEqual(["d5"]);
		expect(r.dropped.map((e) => e.id)).toEqual(["d7", "d8"]);
		expect(r.log.at(-1)?.seq).toBe(5);
	});
});

/** A server that accepts batches in order, can go offline, and records every upload. */
function batchServer() {
	const server = { events: [...opening], offline: false, batches: [] as number[][] };
	const transport: Transport = {
		async post() {
			throw new Error("batch only");
		},
		async postBatch(events) {
			server.batches.push(events.map((e) => e.seq));
			if (server.offline)
				return { acked: 0, failure: { status: 0, code: "NETWORK", error: "offline" } };
			let acked = 0;
			for (const e of events) {
				const last = server.events.at(-1)?.seq ?? 0;
				if (e.seq !== last + 1)
					return { acked, failure: { status: 409, code: "SEQ_CONFLICT", error: "stale" } };
				if (!server.events.some((x) => x.id === e.id)) server.events.push(e);
				acked++;
			}
			return { acked, failure: null };
		},
		async fetchAfter(after) {
			return server.events.filter((e) => e.seq > after);
		},
	};
	return { server, transport };
}

describe("offline scoring", () => {
	it("persists taps while offline, retries with backoff, uploads one ordered batch and empties the outbox", async () => {
		const { server, transport } = batchServer();
		const outbox = createOutbox("m1", fresh());
		const timers: { run: () => void; ms: number }[] = [];
		const store = createScoringStore([...opening], transport, {
			outbox,
			random: () => 1,
			schedule: (run, ms) => {
				const t = { run, ms };
				timers.push(t);
				return () => timers.splice(timers.indexOf(t), 1);
			},
		});
		server.offline = true;
		for (let i = 0; i < 3; i++) store.getState().record("DELIVERY", ball(1));
		await settle();
		expect(store.getState().sync).toBe("offline");
		expect((await outbox.unacked()).map((e) => e.seq)).toEqual([4, 5, 6]);
		expect(timers.map((t) => t.ms)).toEqual([1000]);

		timers[0]!.run(); // still offline: the delay doubles
		await settle();
		expect(timers.map((t) => t.ms).at(-1)).toBe(2000);

		server.offline = false;
		timers.at(-1)!.run();
		await settle();
		expect(store.getState().sync).toBe("synced");
		expect(server.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
		expect(server.batches.at(-1)).toEqual([4, 5, 6]);
		expect(await outbox.unacked()).toEqual([]);
	});

	it("after a reload, replays the saved tail and uploads it", async () => {
		const { server, transport } = batchServer();
		const idb = fresh();
		const before = createOutbox("m1", idb);
		await before.add(delivery(4));
		await before.add(delivery(5));

		const outbox = createOutbox("m1", idb);
		const store = createScoringStore([...opening], transport, {
			outbox,
			recovered: await outbox.unacked(),
		});
		expect(store.getState().state.innings[0]!.runs).toBe(2);
		expect(store.getState().queue).toHaveLength(2);
		await settle();
		expect(server.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
		expect(await outbox.unacked()).toEqual([]);
	});

	it("tells the scorer when a saved entry no longer fits", async () => {
		const { transport } = batchServer();
		const store = createScoringStore([...opening], transport, { recovered: [delivery(9)] });
		expect(store.getState().message).toMatch(/discarded/);
		expect(store.getState().queue).toEqual([]);
	});

	it("clears the outbox when the server's log wins a conflict", async () => {
		const { server, transport } = batchServer();
		const outbox = createOutbox("m1", fresh());
		const store = createScoringStore([...opening], transport, { outbox });
		server.events.push(delivery(4)); // another scorer got there first
		store.getState().record("DELIVERY", ball(1));
		await settle();
		expect(store.getState().log.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
		expect(await outbox.unacked()).toEqual([]);
	});
});
