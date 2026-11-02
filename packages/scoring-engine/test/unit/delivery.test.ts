import { describe, expect, it } from "vitest";
import { scoreDelivery } from "../../src/reducer/delivery";
import { PRESETS } from "../../src/rules/presets";
import { DOT, parseBall, started } from "../dsl";

const T20 = PRESETS.T20;

describe("runs and boundaries", () => {
	it("R-RUN-01: runs completed go to striker, bowler and team, and count a legal ball", () => {
		const m = started().balls("3");
		const a1 = m.inn.batters[0]!;
		expect(a1).toMatchObject({ runs: 3, balls: 1 });
		expect(m.inn.bowlers[0]).toMatchObject({ runs: 3, legalBalls: 1 });
		expect(m.inn).toMatchObject({ runs: 3, legalBalls: 1 });
		m.balls("5 7");
		expect(m.inn.runs).toBe(15);
	});

	it("R-RUN-02: a boundary scores its allowance unless more runs were completed", () => {
		expect(scoreDelivery(T20, { ...DOT, boundary: "FOUR", runs: 1 }).scored).toBe(4);
		expect(scoreDelivery(T20, { ...DOT, boundary: "FOUR", runs: 5 }).scored).toBe(5);
		expect(scoreDelivery(T20, { ...DOT, boundary: "SIX" }).scored).toBe(6);
		const m = started().balls("4! 6!");
		expect(m.inn.batters[0]).toMatchObject({ runs: 10, fours: 1, sixes: 1 });
		expect(m.inn.bowlers[0]).toMatchObject({ foursConceded: 1, sixesConceded: 1 });
		expect(m.inn.boundaries).toBe(2);
	});

	it("R-RUN-02: custom boundary values apply", () => {
		const m = started("BOX_CRICKET", { rules: { boundaryFour: 2, boundarySix: 3 } }).balls("4! 6!");
		expect(m.inn.runs).toBe(5);
	});

	it("R-RUN-03: an overthrow boundary adds the allowance to runs completed and is not a 'four'", () => {
		const m = started().ball({ runs: 2, boundary: "FOUR", overthrow: true });
		expect(m.inn.runs).toBe(6);
		expect(m.inn.batters[0]).toMatchObject({ runs: 6, fours: 0 });
		// Even runs: the striker keeps strike (2019 World Cup final).
		expect(m.inn.strikerId).toBe("a1");
	});

	it("R-RUN-04: short runs are recorded as the runs that count", () => {
		const m = started().balls("1");
		expect(m.inn.runs).toBe(1);
	});

	it("R-RUN-05: team total equals bat runs plus extras", () => {
		const m = started().balls("1 2wd 3nb 2b 1lb 4! 1+5p");
		const bat = m.inn.batters.reduce((n, b) => n + b.runs, 0);
		const e = m.inn.extras;
		expect(m.inn.runs).toBe(bat + e.wides + e.noBalls + e.byes + e.legByes + e.penalties);
	});

	it("R-RUN-06: a dot is a legal ball with nothing off the bat", () => {
		const m = started().balls(". 1 1lb");
		expect(m.inn.batters[0]!.dots).toBe(1);
		expect(m.inn.batters[1]!.dots).toBe(1);
		expect(m.inn.bowlers[0]!.dots).toBe(2); // the leg bye is a dot for the bowler
		expect(m.inn.currentOver!.balls.map((b) => b.label)).toEqual(["•", "1", "1lb"]);
	});

	it("rejects malformed runs and impossible boundaries", () => {
		const m = started();
		m.rejectsBall({ runs: -1 }, "INVALID_RUNS");
		m.rejectsBall({ runs: 1.5 }, "INVALID_RUNS");
		m.rejectsBall({ runs: 21 }, "INVALID_RUNS");
		m.rejectsBall({ penaltyRuns: -5 }, "INVALID_RUNS");
		m.rejectsBall({ boundary: "SIX", runs: 1 }, "INVALID_BOUNDARY");
		m.rejectsBall({ boundary: "SIX", overthrow: true }, "INVALID_BOUNDARY");
		m.rejectsBall({ boundary: "SIX", extra: { kind: "BYE" } }, "INVALID_BOUNDARY");
		m.rejectsBall(
			{ boundary: "SIX", extra: { kind: "NO_BALL", runsFrom: "LEG_BYE" } },
			"INVALID_BOUNDARY",
		);
		m.rejectsBall({ extra: { kind: "BYE" } }, "INVALID_RUNS");
	});
});

describe("extras", () => {
	it("R-EXT-01: a wide scores the penalty plus runs as wides, charged to the bowler, not faced", () => {
		const m = started().balls("2wd");
		expect(m.inn.extras.wides).toBe(3);
		expect(m.inn.bowlers[0]).toMatchObject({ runs: 3, wides: 1, legalBalls: 0 });
		expect(m.inn.batters[0]!.balls).toBe(0);
		expect(m.inn.legalBalls).toBe(0);
		expect(m.inn.currentOver!.balls[0]!.label).toBe("3wd");
	});

	it("R-EXT-02: a wide to the boundary is the penalty plus four", () => {
		const m = started().balls("4wd!");
		expect(m.inn.runs).toBe(5);
		expect(m.inn.boundaries).toBe(0); // not a boundary off the bat
		const custom = started("T20", { rules: { wideRuns: 2 } }).balls("wd");
		expect(custom.inn.runs).toBe(2);
	});

	it("R-EXT-03: a no-ball adds the penalty, is not legal, but is a ball faced", () => {
		const m = started().balls("nb");
		expect(m.inn.extras.noBalls).toBe(1);
		expect(m.inn.batters[0]!.balls).toBe(1);
		expect(m.inn.bowlers[0]).toMatchObject({ runs: 1, noBalls: 1, legalBalls: 0 });
		expect(m.inn.legalBalls).toBe(0);
	});

	it("R-EXT-04: bat runs off a no-ball go to the striker and the bowler", () => {
		const m = started().balls("4nb!");
		expect(m.inn.batters[0]).toMatchObject({ runs: 4, fours: 1 });
		expect(m.inn.bowlers[0]!.runs).toBe(5);
		expect(m.inn.currentOver!.balls[0]!.label).toBe("5nb");
	});

	it("R-EXT-05: byes and leg byes count to the total only, as legal balls faced", () => {
		const m = started().balls("2b 4lb!");
		expect(m.inn.extras).toMatchObject({ byes: 2, legByes: 4 });
		expect(m.inn.batters[0]).toMatchObject({ runs: 0, balls: 2 });
		expect(m.inn.bowlers[0]).toMatchObject({ runs: 0, legalBalls: 2 });
		expect(m.inn.batters[0]!.fours).toBe(0);
	});

	it("R-EXT-06: leg byes are accepted as recorded (umpire's judgement)", () => {
		expect(started().balls("1lb").inn.extras.legByes).toBe(1);
	});

	it("R-EXT-07: runs off a wide are wides, never byes", () => {
		expect(scoreDelivery(T20, parseBall("1wd")).extras).toMatchObject({ wides: 2, byes: 0 });
	});

	it("R-EXT-08: no-ball byes are byes (ICC) or no-ball extras (Law 21.10)", () => {
		const icc = started().balls("2nbb 1nblb");
		expect(icc.inn.extras).toMatchObject({ noBalls: 2, byes: 2, legByes: 1 });
		expect(icc.inn.bowlers[0]!.runs).toBe(2);
		const law = started("T20", { rules: { noBallByesScoredAs: "NO_BALLS" } }).balls("2nbb");
		expect(law.inn.extras).toMatchObject({ noBalls: 3, byes: 0 });
		expect(law.inn.bowlers[0]!.runs).toBe(3);
	});

	it("R-EXT-09: penalty runs to the batting side go to the current innings", () => {
		const m = started().event("PENALTY_RUNS", {
			toTeamId: "A",
			runs: 5,
			reason: "ball hit helmet",
		});
		expect(m.inn.runs).toBe(5);
		expect(m.inn.extras.penalties).toBe(5);
		expect(m.inn.partnerships[0]!.runs).toBe(5);
	});

	it("R-EXT-10: penalty runs on a delivery are in addition to the runs", () => {
		const m = started().balls("1+5p");
		expect(m.inn.runs).toBe(6);
		expect(m.inn.batters[0]!.runs).toBe(1);
		expect(m.inn.bowlers[0]!.runs).toBe(1);
		expect(m.inn.currentOver!.balls[0]!.label).toBe("1+5p");
	});
});

describe("strike rotation", () => {
	it("R-STR-01: odd runs swap strike, even runs and boundaries do not", () => {
		const m = started().balls("1");
		expect(m.inn.strikerId).toBe("a2");
		m.balls("2 4!");
		expect(m.inn.strikerId).toBe("a2");
		m.ball({ runs: 5, boundary: "FOUR" }); // 5 completed before the ball reached the rope
		expect(m.inn.strikerId).toBe("a1");
	});

	it("R-STR-02: wides rotate on runs completed, not the penalty", () => {
		const m = started().balls("wd");
		expect(m.inn.strikerId).toBe("a1");
		m.balls("1wd");
		expect(m.inn.strikerId).toBe("a2");
		m.balls("4wd!");
		expect(m.inn.strikerId).toBe("a2");
	});

	it("R-STR-03: no-balls rotate on runs completed", () => {
		const m = started().balls("nb 1nb 1nbb");
		expect(m.inn.strikerId).toBe("a1");
	});

	it("R-STR-04: byes and leg byes rotate on runs completed", () => {
		const m = started().balls("1b 3lb 2b");
		expect(m.inn.strikerId).toBe("a1");
	});

	it("R-STR-05: an odd run off the last ball, then the end of the over, keeps the striker", () => {
		const m = started().balls(". . . . . 1").endOver();
		expect(m.inn.strikerId).toBe("a1");
	});

	it("R-STR-06: SWAP_STRIKE is a manual override", () => {
		const m = started().event("SWAP_STRIKE", { reason: "batters crossed" });
		expect(m.inn.strikerId).toBe("a2");
		m.out("BOWLED", {});
		m.rejects("SWAP_STRIKE", { reason: "x" }, "CANNOT_SWAP");
	});
});

describe("free hit", () => {
	it("R-EXT-03: the ball after a no-ball is a free hit; a wide keeps it; a legal ball clears it", () => {
		const m = started().balls("nb");
		expect(m.inn.freeHit).toBe(true);
		m.balls("wd");
		expect(m.inn.freeHit).toBe(true);
		m.balls("1");
		expect(m.inn.freeHit).toBe(false);
	});

	it("R-EXT-03: no free hits when the format disables them", () => {
		const m = started("T20", { rules: { freeHit: "NONE" } }).balls("nb");
		expect(m.inn.freeHit).toBe(false);
	});
});
