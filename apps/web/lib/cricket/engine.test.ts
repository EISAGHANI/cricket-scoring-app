import { describe, expect, it } from "vitest";
import { computeMatchState, currentOver, tryApply, yetToBat } from "./engine";
import { dismissalText, oversText, playerLookup } from "./format";
import type { BallEvent, Match, MatchEvent, Wicket } from "./types";

function makeMatch(playersPerSide = 11, overs = 2): Match {
	const team = (key: "A" | "B") => ({
		teamId: key,
		name: `Team ${key}`,
		shortName: key,
		color: "#000",
		players: Array.from({ length: playersPerSide }, (_, i) => ({
			id: `${key}${i + 1}`,
			name: `${key} Player ${i + 1}`,
		})),
	});
	return {
		id: "m",
		createdAt: 0,
		updatedAt: 0,
		teams: [team("A"), team("B")],
		oversPerInnings: overs,
		toss: { winner: 0, decision: "bat" },
		battingFirst: 0,
		events: [],
	};
}

const start = (s: string, ns: string, b: string): MatchEvent => ({
	type: "startInnings",
	strikerId: s,
	nonStrikerId: ns,
	bowlerId: b,
});
const r = (runs: number): BallEvent => ({ type: "ball", runs });
const wd = (extraRuns = 0): BallEvent => ({ type: "ball", runs: 0, extra: "wide", extraRuns });
const nb = (runs = 0): BallEvent => ({ type: "ball", runs, extra: "noBall" });
const bye = (n: number): BallEvent => ({ type: "ball", runs: 0, extra: "bye", extraRuns: n });
const out = (w: Wicket, runs = 0): BallEvent => ({ type: "ball", runs, wicket: w });
const bowler = (id: string): MatchEvent => ({ type: "newBowler", playerId: id });
const bat = (id: string): MatchEvent => ({ type: "newBatter", playerId: id });

function play(match: Match, events: MatchEvent[]) {
	match.events = events;
	return computeMatchState(match);
}

describe("basic scoring", () => {
	it("asks for openers before the first ball", () => {
		const s = play(makeMatch(), []);
		expect(s.pending).toEqual({ kind: "openers", innings: 1 });
	});

	it("credits runs, rotates strike on odd runs and counts balls", () => {
		const s = play(makeMatch(), [start("A1", "A2", "B1"), r(1), r(4), r(2), r(0)]);
		const inn = s.current!;
		expect(inn.runs).toBe(7);
		expect(inn.legalBalls).toBe(4);
		expect(inn.strikerId).toBe("A2");
		const a1 = inn.batters.find((b) => b.playerId === "A1")!;
		const a2 = inn.batters.find((b) => b.playerId === "A2")!;
		expect([a1.runs, a1.balls]).toEqual([1, 1]);
		expect([a2.runs, a2.balls, a2.fours]).toEqual([6, 3, 1]);
		expect(inn.bowlers[0]).toMatchObject({ legalBalls: 4, runs: 7, dots: 1 });
	});

	it("ends the over after six legal balls, swaps strike and needs a new bowler", () => {
		const s = play(makeMatch(), [start("A1", "A2", "B1"), r(0), r(0), r(0), r(0), r(0), r(1)]);
		const inn = s.current!;
		expect(oversText(inn.legalBalls)).toBe("1.0");
		// A1 took a single on the last ball (-> non-striker), then ends swap: A1 on strike.
		expect(inn.strikerId).toBe("A1");
		expect(s.pending).toEqual({ kind: "newBowler" });
		expect(currentOver(inn)?.balls.map((b) => b.label)).toEqual(["0", "0", "0", "0", "0", "1"]);
	});

	it("does not let a bowler bowl consecutive overs", () => {
		const m = makeMatch();
		m.events = [start("A1", "A2", "B1"), r(0), r(0), r(0), r(0), r(0), r(0)];
		expect(tryApply(m, bowler("B1"))).toMatch(/two overs in a row/);
		expect(tryApply(m, bowler("B2"))).toBeNull();
	});

	it("records a maiden", () => {
		const s = play(makeMatch(), [start("A1", "A2", "B1"), r(0), r(0), bye(1), r(0), r(0), r(0)]);
		expect(s.current!.bowlers[0].maidens).toBe(1);
		expect(s.current!.runs).toBe(1);
	});
});

describe("extras", () => {
	it("wides add a penalty, are not legal and are not faced", () => {
		const s = play(makeMatch(), [start("A1", "A2", "B1"), wd(), wd(1)]);
		const inn = s.current!;
		expect(inn.runs).toBe(3);
		expect(inn.legalBalls).toBe(0);
		expect(inn.extras.wides).toBe(3);
		expect(inn.batters[0].balls).toBe(0);
		expect(inn.strikerId).toBe("A2"); // ran one on the second wide
		expect(inn.bowlers[0]).toMatchObject({ runs: 3, wides: 3 });
	});

	it("no-ball: penalty plus bat runs, faced by the batter, gives a free hit", () => {
		const s = play(makeMatch(), [start("A1", "A2", "B1"), nb(4)]);
		const inn = s.current!;
		expect(inn.runs).toBe(5);
		expect(inn.legalBalls).toBe(0);
		expect(inn.batters[0]).toMatchObject({ runs: 4, balls: 1, fours: 1 });
		expect(inn.freeHit).toBe(true);
		expect(inn.extras.noBalls).toBe(1);
	});

	it("only a run out is possible on a free hit, and it carries over a wide", () => {
		const m = makeMatch();
		m.events = [start("A1", "A2", "B1"), nb(), wd()];
		expect(computeMatchState(m).current!.freeHit).toBe(true);
		expect(tryApply(m, out({ kind: "bowled", playerOutId: "A1" }))).toMatch(/free hit/);
		expect(tryApply(m, out({ kind: "runOut", playerOutId: "A2" }, 1))).toBeNull();
	});

	it("byes go to extras, not the batter or bowler", () => {
		const s = play(makeMatch(), [
			start("A1", "A2", "B1"),
			bye(2),
			{ type: "ball", runs: 0, extra: "legBye", extraRuns: 1 },
		]);
		const inn = s.current!;
		expect(inn.runs).toBe(3);
		expect(inn.extras).toMatchObject({ byes: 2, legByes: 1 });
		expect(inn.batters[0]).toMatchObject({ runs: 0, balls: 2 });
		expect(inn.bowlers[0].runs).toBe(0);
	});
});

describe("wickets", () => {
	it("requires a new batter, records fall of wicket and dismissal text", () => {
		const m = makeMatch();
		const s = play(m, [
			start("A1", "A2", "B1"),
			r(2),
			out({ kind: "caught", playerOutId: "A1", fielderId: "B5" }),
		]);
		expect(s.pending).toEqual({ kind: "newBatter" });
		const inn = s.current!;
		expect(inn.wickets).toBe(1);
		expect(inn.fallOfWickets[0]).toMatchObject({ wicket: 1, runs: 2, playerId: "A1" });
		expect(inn.bowlers[0].wickets).toBe(1);
		const name = playerLookup(m);
		expect(dismissalText(inn.batters[0], name)).toBe("c B Player 5 b B Player 1");
		const after = play(m, [...m.events, bat("A3")]);
		expect(after.current!.strikerId).toBe("A3");
		expect(yetToBat(m, after.current!).map((p) => p.id)).not.toContain("A3");
	});

	it("run out of the non-striker is not credited to the bowler", () => {
		const s = play(makeMatch(), [
			start("A1", "A2", "B1"),
			out({ kind: "runOut", playerOutId: "A2", fielderId: "B3" }, 1),
		]);
		const inn = s.current!;
		expect(inn.runs).toBe(1);
		expect(inn.bowlers[0].wickets).toBe(0);
		// One run completed: A1 crossed to the non-striker's end, A2 out at the striker's end.
		expect(inn.strikerId).toBeNull();
		expect(inn.nonStrikerId).toBe("A1");
	});

	it("rejects non-run-out dismissals of the non-striker", () => {
		const m = makeMatch();
		m.events = [start("A1", "A2", "B1")];
		expect(tryApply(m, out({ kind: "bowled", playerOutId: "A2" }))).toMatch(/non-striker/);
	});

	it("closes the innings when all out", () => {
		const s = play(makeMatch(3), [
			start("A1", "A2", "B1"),
			out({ kind: "bowled", playerOutId: "A1" }),
			bat("A3"),
			out({ kind: "lbw", playerOutId: "A3" }),
		]);
		expect(s.current!.closed).toBe("allOut");
		expect(s.target).toBe(1);
		expect(s.pending).toEqual({ kind: "openers", innings: 2 });
	});
});

describe("match result", () => {
	function firstInnings(runsPerBall: number[]): MatchEvent[] {
		// 1 over per innings for brevity.
		return [start("A1", "A2", "B1"), ...runsPerBall.map(r)];
	}

	it("chasing side wins by wickets once it passes the target", () => {
		const m = makeMatch(11, 1);
		const s = play(m, [
			...firstInnings([1, 1, 1, 1, 1, 1]),
			start("B1", "B2", "A1"),
			r(4),
			r(2),
			r(1),
		]);
		expect(s.target).toBe(7);
		expect(s.innings[1].closed).toBe("target");
		expect(s.result).toMatchObject({ winner: 1, by: "wickets", margin: 10 });
		expect(s.result!.text).toBe("Team B won by 10 wickets (3 balls left)");
		expect(s.pending).toBeNull();
	});

	it("defending side wins by runs", () => {
		const m = makeMatch(11, 1);
		const s = play(m, [
			...firstInnings([6, 6, 0, 0, 0, 0]),
			start("B1", "B2", "A1"),
			r(1),
			r(1),
			r(1),
			r(1),
			r(1),
			r(1),
		]);
		expect(s.result).toMatchObject({ winner: 0, by: "runs", margin: 6 });
		expect(s.result!.text).toBe("Team A won by 6 runs");
	});

	it("tie", () => {
		const m = makeMatch(11, 1);
		const s = play(m, [
			...firstInnings([4, 0, 0, 0, 0, 0]),
			start("B1", "B2", "A1"),
			r(2),
			r(2),
			r(0),
			r(0),
			r(0),
			r(0),
		]);
		expect(s.result!.by).toBe("tie");
	});

	it("rejects balls after the innings closes and a third innings", () => {
		const m = makeMatch(11, 1);
		m.events = [...firstInnings([0, 0, 0, 0, 0, 0])];
		expect(tryApply(m, r(1))).toMatch(/innings is over/);
		m.events.push(start("B1", "B2", "A1"), r(1));
		expect(computeMatchState(m).result?.winner).toBe(1);
		expect(tryApply(m, start("A3", "A4", "B1"))).toMatch(/Both innings/);
	});
});

describe("undo", () => {
	it("dropping the last event restores the previous state exactly", () => {
		const m = makeMatch();
		const events = [
			start("A1", "A2", "B1"),
			r(1),
			nb(2),
			out({ kind: "bowled", playerOutId: "A2" }),
		];
		const before = play(m, events.slice(0, -1));
		const after = play(m, events.slice(0, -1));
		expect(after).toEqual(before);
		expect(after.current!.wickets).toBe(0);
		expect(after.current!.freeHit).toBe(true);
	});
});
