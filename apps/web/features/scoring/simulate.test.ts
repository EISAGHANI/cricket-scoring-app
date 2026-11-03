import {
	PRESETS,
	appendEvent,
	initialState,
	type MatchEvent,
	type MatchState,
	type PresetId,
} from "@cricket/scoring-engine";
import { describe, expect, it } from "vitest";
import { simulateNext } from "./simulate";

function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function play(preset: PresetId, seed: number): { log: MatchEvent[]; state: MatchState } {
	const rules = PRESETS[preset];
	const n = rules.playersPerSide;
	const sheet = (t: string) => ({
		teamId: t,
		name: t,
		shortName: t,
		playingXI: Array.from({ length: n }, (_, i) => ({ id: `${t}${i}`, name: `${t} ${i}` })),
		substitutes: [],
		captainId: `${t}0`,
		wicketKeeperId: `${t}1`,
	});
	let log: MatchEvent[] = [];
	let state = initialState();
	const first = {
		id: "1",
		seq: 1,
		type: "MATCH_STARTED",
		payload: { rules, teams: [sheet("A"), sheet("B")] },
	} as MatchEvent;
	({ log, state } = appendEvent(log, state, first));
	const rand = rng(seed);
	for (let i = 0; i < 5000; i++) {
		const next = simulateNext(state, rand);
		if (next === null) break;
		const event = { id: String(log.length + 1), seq: log.length + 1, ...next } as MatchEvent;
		({ log, state } = appendEvent(log, state, event)); // throws if the engine rejects it
	}
	return { log, state };
}

describe("simulateNext", () => {
	it.each([
		["T20", 1],
		["T20", 2],
		["T10", 3],
		["ODI", 4],
		["HUNDRED", 5],
		["LAST_MAN_STANDS", 6],
	] as const)("plays a valid %s match to a result (seed %i)", (preset, seed) => {
		const { state } = play(preset, seed);
		expect(state.status).toBe("COMPLETE");
		expect(state.result).not.toBeNull();
		expect(simulateNext(state, rng(1))).toBeNull();
	});
});
