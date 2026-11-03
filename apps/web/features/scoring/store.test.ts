import { PRESETS, type MatchEvent } from "@cricket/scoring-engine";
import { describe, expect, it } from "vitest";
import { canUndo, createScoringStore, type Transport } from "./store";

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

/** An in-memory server that enforces seq like the real one. */
function fakeServer(events: MatchEvent[] = [...opening]) {
	const server = { events, offline: false, posts: 0 };
	const transport: Transport = {
		async post(event) {
			server.posts++;
			if (server.offline) return { ok: false, status: 0, code: "NETWORK", error: "offline" };
			const last = server.events.at(-1)?.seq ?? 0;
			if (event.seq !== last + 1)
				return { ok: false, status: 409, code: "SEQ_CONFLICT", error: "stale", lastSeq: last };
			server.events.push(event);
			return { ok: true, lastSeq: event.seq };
		},
		async fetchAfter(after) {
			return server.events.filter((e) => e.seq > after);
		},
	};
	return { server, transport };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("scoring store", () => {
	it("applies taps instantly, posts them in order and adds END_OF_OVER after the sixth ball", async () => {
		const { server, transport } = fakeServer();
		const store = createScoringStore([...opening], transport);
		for (let i = 0; i < 6; i++) store.getState().record("DELIVERY", ball(1));
		// Local state is already up to date before the server answers.
		expect(store.getState().state.innings[0]!.runs).toBe(6);
		await settle();
		await settle();
		expect(store.getState().sync).toBe("synced");
		expect(server.events.map((e) => e.type).slice(-2)).toEqual(["DELIVERY", "END_OF_OVER"]);
		expect(server.events.map((e) => e.seq)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
	});

	it("rejects an illegal tap locally with the engine's message, posting nothing", async () => {
		const { server, transport } = fakeServer();
		const store = createScoringStore([...opening], transport);
		expect(store.getState().record("BATTER_IN", { batterId: "c" })).toBe(false);
		expect(store.getState().message).toMatch(/./);
		expect(server.posts).toBe(0);
	});

	it("undo takes back the ball and its automatic END_OF_OVER together", async () => {
		const { server, transport } = fakeServer();
		const store = createScoringStore([...opening], transport);
		for (let i = 0; i < 6; i++) store.getState().record("DELIVERY", ball());
		store.getState().undo();
		const inn = store.getState().state.innings[0]!;
		expect(inn.legalBalls).toBe(5);
		expect(inn.currentOver?.legalBalls).toBe(5);
		await settle();
		await settle();
		expect(server.events.slice(-2).map((e) => e.type)).toEqual(["UNDO", "UNDO"]);
		expect(canUndo(store.getState().log)).toBe(true);
		expect(canUndo(opening.slice(0, 1))).toBe(false);
		createScoringStore(opening.slice(0, 1), transport).getState().undo(); // no-op on MATCH_STARTED
	});

	it("resyncs from the server when another device scored first", async () => {
		const { server, transport } = fakeServer();
		const store = createScoringStore([...opening], transport);
		// Another scorer records seq 4 first.
		server.events.push({ id: "other", seq: 4, type: "DELIVERY", payload: ball(4) } as MatchEvent);
		store.getState().record("DELIVERY", ball(1));
		await settle();
		await settle();
		const s = store.getState();
		expect(s.message).toMatch(/Someone else is scoring/);
		expect(s.queue).toEqual([]);
		expect(s.state.innings[0]!.runs).toBe(4);
		expect(s.log.at(-1)!.id).toBe("other");
	});

	it("keeps unsent entries while offline and sends them on retry", async () => {
		const { server, transport } = fakeServer();
		const store = createScoringStore([...opening], transport);
		server.offline = true;
		store.getState().record("DELIVERY", ball(2));
		store.getState().record("DELIVERY", ball(3));
		await settle();
		expect(store.getState().sync).toBe("offline");
		expect(store.getState().queue).toHaveLength(2);
		server.offline = false;
		store.getState().retry();
		await settle();
		await settle();
		expect(store.getState().sync).toBe("synced");
		expect(server.events).toHaveLength(5);
	});

	it("pulls events recorded elsewhere", async () => {
		const { server, transport } = fakeServer();
		const store = createScoringStore([...opening], transport);
		server.events.push({ id: "x", seq: 4, type: "DELIVERY", payload: ball(6 - 6) } as MatchEvent);
		await store.getState().pull();
		expect(store.getState().log).toHaveLength(4);
	});
});
