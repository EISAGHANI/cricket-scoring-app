import { describe, expect, it } from "vitest";
import { needsBatter, parScore } from "../../src";
import { jsonEqual } from "../../src/internal/equal";
import {
	applyEvent,
	awaiting,
	initialState,
	replay,
	tryApplyEvent,
	RuleViolation,
	format,
} from "../../src";
import { PRESETS, validateRules } from "../../src/rules/presets";
import { match, sheet, started, Scorebook } from "../dsl";

/** Plays a 2-over, 3-player innings for side A at the given score. */
function firstInnings(runs: string): Scorebook {
	return match("T20", { overs: 1, players: 3 }).toss("A", "BAT").open("a1", "a2", "b1").balls(runs);
}

describe("lifecycle", () => {
	it("R-LC-01: the first event must be MATCH_STARTED, then TOSS before any innings", () => {
		const m = new Scorebook();
		m.rejects("TOSS", { winnerTeamId: "A", decision: "BAT" }, "MATCH_NOT_STARTED");
		m.start(PRESETS.T20, sheet("A", 11), sheet("B", 11));
		m.rejects(
			"MATCH_STARTED",
			{ rules: PRESETS.T20, teams: [sheet("A", 11), sheet("B", 11)] },
			"ALREADY_STARTED",
		);
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "A", strikerId: "a1", nonStrikerId: "a2", bowlerId: "b1" },
			"TOSS_REQUIRED",
		);
		m.rejects("TOSS", { winnerTeamId: "Z", decision: "BAT" }, "UNKNOWN_TEAM");
		m.toss("B", "BOWL");
		m.rejects("TOSS", { winnerTeamId: "A", decision: "BAT" }, "TOSS_ALREADY_RECORDED");
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "B", strikerId: "b1", nonStrikerId: "b2", bowlerId: "a1" },
			"WRONG_BATTING_TEAM",
		);
		m.open("a1", "a2", "b1");
		expect(m.inn.battingTeamId).toBe("A");
	});

	it("R-LC-01: rules and team sheets are validated", () => {
		const m = new Scorebook();
		const bad = (patch: Partial<typeof PRESETS.T20>): void => {
			m.rejects(
				"MATCH_STARTED",
				{ rules: { ...PRESETS.T20, ...patch }, teams: [sheet("A", 11), sheet("B", 11)] },
				"INVALID_RULES",
			);
		};
		bad({ playersPerSide: 1 });
		bad({ playersPerSide: 16 });
		bad({ ballsPerOver: 0 });
		bad({ oversPerInnings: 0 });
		bad({ oversPerInnings: null });
		bad({ inningsPerSide: 2 });
		bad({ bowlerMaxOvers: 0 });
		bad({ bowlerMaxBalls: -1 });
		bad({ maxConsecutiveOvers: 0 });
		bad({ oversPerEnd: 0 });
		bad({ wideRuns: -1 });
		bad({ noBallRuns: 1.5 });
		bad({ superOverBalls: 0 });
		bad({ superOverWickets: 0 });
		bad({ dlsG50: null });
		expect(() => validateRules(PRESETS.TEST)).not.toThrow();
		const xi = sheet("A", 11);
		m.rejects("MATCH_STARTED", { rules: PRESETS.T20, teams: [xi, xi] }, "SAME_TEAM");
		m.rejects(
			"MATCH_STARTED",
			{ rules: PRESETS.T20, teams: [sheet("A", 10), sheet("B", 11)] },
			"WRONG_XI_SIZE",
		);
		const dup = {
			...sheet("B", 11),
			playingXI: [...sheet("B", 10).playingXI, { id: "a1", name: "x" }],
		};
		m.rejects("MATCH_STARTED", { rules: PRESETS.T20, teams: [xi, dup] }, "DUPLICATE_PLAYER");
		m.rejects(
			"MATCH_STARTED",
			{ rules: PRESETS.T20, teams: [{ ...xi, captainId: "as1" }, sheet("B", 11)] },
			"CAPTAIN_OR_KEEPER_NOT_IN_XI",
		);
	});

	it("R-LC-02: awaiting lists what may happen next", () => {
		expect(awaiting(initialState())).toEqual(["MATCH_STARTED"]);
		const m = match("T20");
		expect(awaiting(m.state)).toEqual(["TOSS", "MATCH_RESULT"]);
		m.toss("A", "BAT");
		expect(awaiting(m.state)).toContain("INNINGS_STARTED");
		expect(awaiting(m.state)).toContain("TARGET_REVISED");
		m.open("a1", "a2", "b1");
		expect(awaiting(m.state)[0]).toBe("DELIVERY");
		m.out("BOWLED");
		expect(awaiting(m.state).slice(0, 3)).toEqual(["BATTER_IN", "WICKET", "INNINGS_ENDED"]);
		m.in("a3").balls(". . . . .");
		expect(awaiting(m.state)[0]).toBe("END_OF_OVER");
		m.endOver();
		expect(awaiting(m.state)[0]).toBe("BOWLER_CHANGE");
		m.event("INTERRUPTION", { kind: "RAIN" });
		expect(awaiting(m.state)[0]).toBe("PLAY_RESUMED");
		const test = match("TEST").toss("A", "BAT").open("a1", "a2", "b1");
		expect(awaiting(test.state)).toContain("DECLARATION");
		test.event("DECLARATION", { teamId: "A" });
		expect(awaiting(test.state)).toContain("INNINGS_ENDED");
		m.event("PLAY_RESUMED", { revisedOvers: null, revisedBowlerMaxOvers: null });
		m.event("MATCH_RESULT", { result: { kind: "ABANDONED" }, override: false });
		expect(awaiting(m.state)).toEqual([]);
	});

	it("R-LC-03: a rejected event leaves the state unchanged", () => {
		const m = started();
		const before = m.state;
		const r = tryApplyEvent(before, m.build("BATTER_IN", { batterId: "a3" }));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toBeInstanceOf(RuleViolation);
			expect(r.error.seq).toBe(m.seq);
			expect(r.error.rule).toBe("R-DIS-09");
		}
		const ok = tryApplyEvent(before, m.build("DELIVERY", m.payloadFor("1")));
		expect(ok.ok).toBe(true);
		expect(before.innings[0]!.runs).toBe(0);
	});

	it("R-LC-03: non-rule errors propagate", () => {
		const m = started();
		const bad = m.build("DELIVERY", null as never);
		expect(() => tryApplyEvent(m.state, bad)).toThrow(TypeError);
	});

	it("R-LC-04: applyEvent is pure and deterministic", () => {
		const m = started().balls("1 4!");
		const frozen = JSON.parse(JSON.stringify(m.state));
		const e = m.build("DELIVERY", m.payloadFor("2"));
		const a = applyEvent(m.state, e);
		const b = applyEvent(m.state, e);
		expect(a).toEqual(b);
		expect(m.state).toEqual(frozen);
	});

	it("R-LC-05: replay equals the incremental fold", () => {
		const m = started().balls("1 4! wd").out("BOWLED").in("a3").balls("1").undo().balls("2");
		expect(replay(m.log)).toEqual(m.state);
	});

	it("R-LC-02: unknown event types are a programming error, not a rule violation", () => {
		const m = started();
		const bogus = { id: "x", seq: m.seq, type: "BOGUS", payload: {} } as never;
		expect(() => applyEvent(m.state, bogus)).toThrow("Unhandled value");
		expect(() => parScore(initialState())).toThrowError(
			expect.objectContaining({ code: "MATCH_NOT_STARTED" }),
		);
		const done = firstInnings("W").in("a3").out("BOWLED");
		expect(needsBatter(done.inn)).toBe(false);
	});

	it("R-LC-06: event sequence numbers must increase", () => {
		const m = started();
		const e = { ...m.build("DELIVERY", m.payloadFor(".")), seq: 1 };
		expect(() => applyEvent(m.state, e)).toThrowError(
			expect.objectContaining({ code: "OUT_OF_ORDER" }),
		);
	});
});

describe("innings end and limited-overs results", () => {
	it("R-INN-01: openers must be two different eligible players", () => {
		const m = match("T20").toss("A", "BAT");
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "A", strikerId: "a1", nonStrikerId: "a1", bowlerId: "b1" },
			"SAME_OPENERS",
		);
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "A", strikerId: "as1", nonStrikerId: "a1", bowlerId: "b1" },
			"BATTER_NOT_ELIGIBLE",
		);
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "A", strikerId: "a1", nonStrikerId: "a2", bowlerId: "a3" },
			"BOWLER_NOT_IN_FIELDING_XI",
		);
	});

	it("R-INN-02: all out closes the innings and sets the chase target", () => {
		const m = firstInnings("1 W").in("a3").out("BOWLED");
		expect(m.inn).toMatchObject({ status: "COMPLETE", closeReason: "ALL_OUT", runs: 1 });
		expect(m.inn.batters.find((b) => b.playerId === "a1")!.status).toBe("NOT_OUT");
		m.rejectsBall(".", "NO_INNINGS_IN_PROGRESS");
		m.open("b1", "b2", "a1");
		expect(m.inn.target).toBe(2);
	});

	it("R-INN-02: overs complete closes the innings without END_OF_OVER", () => {
		const m = firstInnings("1 1 1 1 1 1");
		expect(m.inn.closeReason).toBe("OVERS");
		expect(m.inn.completedOvers).toBe(1);
		expect(m.inn.partnerships[0]!.endedBy).toBe("INNINGS_END");
	});

	it("R-INN-02: reaching the target closes the chase", () => {
		const m = firstInnings("1 1 . . . .").open("b1", "b2", "a1").balls("1 2");
		expect(m.inn.closeReason).toBe("TARGET");
		expect(format.formatOvers(m.state, m.inn)).toBe("0.2");
	});

	it("R-INN-04: legal balls never exceed the allocation", () => {
		const m = firstInnings(". . . . . .");
		expect(m.inn.legalBalls).toBe(6);
		m.rejectsBall(".", "NO_INNINGS_IN_PROGRESS");
	});

	it("R-INN-05: wickets never exceed players − 1", () => {
		const m = firstInnings("W").in("a3").balls("W");
		expect(m.inn.wickets).toBe(2);
		expect(m.inn.status).toBe("COMPLETE");
	});

	it("R-INN-06: batting order is free; order of appearance is recorded", () => {
		const m = started().out("BOWLED").in("a9");
		expect(m.inn.batters.map((b) => b.position)).toEqual([1, 2, 3]);
		expect(m.inn.batters[2]!.playerId).toBe("a9");
	});

	it("R-INN-07: chase target is the first-innings total plus one", () => {
		const m = firstInnings("4! 6! . . . .").open("b1", "b2", "a1");
		expect(m.inn.target).toBe(11);
	});

	it("R-RES-01: chasing side wins by wickets with balls remaining", () => {
		const m = firstInnings("1 . . . . .").open("b1", "b2", "a1").balls(". 2");
		expect(m.state.provisionalResult).toEqual({
			kind: "WIN",
			winnerTeamId: "B",
			margin: { type: "WICKETS", wickets: 2, ballsRemaining: 4 },
			method: "NORMAL",
		});
		m.result();
		expect(m.state.status).toBe("COMPLETE");
		expect(format.resultText(m.state, m.state.result!)).toBe(
			"Team B won by 2 wickets (4 balls left)",
		);
		m.rejectsBall(".", "MATCH_COMPLETE");
	});

	it("R-RES-02: defending side wins by runs", () => {
		const m = firstInnings("4! . . . . .").open("b1", "b2", "a1").balls("1 1 . . . .");
		expect(m.state.provisionalResult).toMatchObject({
			winnerTeamId: "A",
			margin: { type: "RUNS", runs: 2 },
		});
		expect(format.resultText(m.state, m.state.provisionalResult!)).toBe("Team A won by 2 runs");
		const one = firstInnings("2 . . . . .").open("b1", "b2", "a1").balls("1 . . . . .");
		expect(format.resultText(one.state, one.state.provisionalResult!)).toBe("Team A won by 1 run");
	});

	it("R-RES-05: declarative results need no computation", () => {
		const m = match("T20").toss("A", "BAT");
		m.rejects(
			"MATCH_RESULT",
			{ result: { kind: "TIE" }, override: false },
			"RESULT_NOT_DETERMINED",
		);
		m.rejects(
			"MATCH_RESULT",
			{ result: { kind: "DRAW" }, override: false },
			"RESULT_NOT_DETERMINED",
		);
		m.rejects(
			"MATCH_RESULT",
			{
				result: {
					kind: "WIN",
					winnerTeamId: "A",
					margin: { type: "RUNS", runs: 5 },
					method: "NORMAL",
				},
				override: false,
			},
			"RESULT_NOT_DETERMINED",
		);
		m.rejects(
			"MATCH_RESULT",
			{
				result: { kind: "WIN", winnerTeamId: "Z", margin: { type: "NONE" }, method: "FORFEIT" },
				override: false,
			},
			"UNKNOWN_TEAM",
		);
		m.event("MATCH_RESULT", {
			result: { kind: "WIN", winnerTeamId: "A", margin: { type: "NONE" }, method: "FORFEIT" },
			override: false,
		});
		expect(format.resultText(m.state, m.state.result!)).toBe("Team A won (forfeit)");
		for (const kind of ["NO_RESULT", "ABANDONED"] as const) {
			const n = started().balls("1").event("MATCH_RESULT", { result: { kind }, override: false });
			expect(n.inn.closeReason).toBe("MATCH_ENDED");
			expect(n.state.result).toEqual({ kind });
		}
	});

	it("R-RES-06: the result must match the computed one unless overridden", () => {
		const m = firstInnings("4! . . . . .").open("b1", "b2", "a1").balls("1 1 . . . .");
		m.rejects("MATCH_RESULT", { result: { kind: "TIE" }, override: false }, "RESULT_MISMATCH");
		m.event("MATCH_RESULT", {
			result: { kind: "WIN", winnerTeamId: "B", margin: { type: "NONE" }, method: "AWARDED" },
			override: true,
		});
		expect(format.resultText(m.state, m.state.result!)).toBe("Team B won (award)");
	});

	it("R-RES-06: the comparison ignores key order (state restored from a JSONB snapshot)", () => {
		const m = firstInnings("4! . . . . .").open("b1", "b2", "a1").balls("1 1 . . . .");
		const result = m.state.provisionalResult!;
		expect(result.kind).toBe("WIN");
		// Postgres jsonb stores object keys in its own order; simulate it by reversing every object.
		const reorder = (v: unknown): unknown =>
			Array.isArray(v)
				? v.map(reorder)
				: v !== null && typeof v === "object"
					? Object.fromEntries(
							Object.entries(v)
								.reverse()
								.map(([k, x]) => [k, reorder(x)]),
						)
					: v;
		const restored = reorder(m.state) as typeof m.state;
		const next = applyEvent(restored, {
			id: "r",
			seq: restored.lastSeq + 1,
			type: "MATCH_RESULT",
			payload: { result, override: false },
		});
		expect(next.result).toEqual(result);
		expect(jsonEqual([1, { a: 1 }], [1, { a: 1 }])).toBe(true);
		expect(jsonEqual([1], { 0: 1 })).toBe(false);
		expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
		expect(jsonEqual({ a: 1 }, { b: 1 })).toBe(false);
		expect(jsonEqual({ a: 1 }, null)).toBe(false);
		expect(jsonEqual(1, "1")).toBe(false);
	});
});
