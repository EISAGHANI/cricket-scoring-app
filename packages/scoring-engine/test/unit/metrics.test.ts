import { describe, expect, it } from "vitest";
import {
	ENGINE_VERSION,
	PRESETS,
	format,
	metrics,
	netRunRate,
	nrrInput,
	validateRules,
} from "../../src";
import type { DeliveryEvent } from "../../src/types/events";
import { match, started, type Scorebook } from "../dsl";

function chase(firstTokens: string, chaseTokens: string): Scorebook {
	return match("T20", { overs: 1, players: 3 })
		.toss("A", "BAT")
		.open("a1", "a2", "b1")
		.balls(firstTokens)
		.open("b1", "b2", "a1")
		.balls(chaseTokens);
}

describe("derived metrics (§15)", () => {
	it("R-MET-01: strike rate, economy, averages and rates", () => {
		expect(metrics.strikeRate(50, 40)).toBe(125);
		expect(metrics.strikeRate(5, 0)).toBeNull();
		expect(metrics.economy(30, 24, 6)).toBe(7.5);
		expect(metrics.economy(3, 0, 6)).toBeNull();
		expect(metrics.average(100, 4)).toBe(25);
		expect(metrics.average(100, 0)).toBeNull();
		const m = started().balls("4! 2 . . . .");
		expect(metrics.runRate(m.inn)).toBe(6);
		expect(metrics.runRate(started().inn)).toBeNull();
	});

	it("R-MET-02: required run rate and projected scores", () => {
		const m = chase("4! 4! 4! . . .", "1 1");
		expect(m.inn.target).toBe(13);
		expect(metrics.requiredRunRate(m.inn)).toBe(16.5); // 11 needed from 4 balls
		expect(metrics.requiredRunRate(m.innings(0))).toBeNull();
		const first = started("T20", { overs: 10 }).balls("4! 2 . . . .").endOver();
		const projections = metrics.projectedScores(first.inn);
		expect(projections[0]).toEqual({ label: "Current", rate: 6, score: 60 });
		expect(projections.map((p) => p.label)).toEqual([
			"Current",
			"-2",
			"-1",
			"+1",
			"+2",
			"6 RPO",
			"8 RPO",
			"10 RPO",
		]);
		expect(metrics.projectedScores(started().inn)).toEqual([]);
		const slow = started("T20", { overs: 10 }).balls("1 . . . . .").endOver();
		expect(metrics.projectedScores(slow.inn).map((p) => p.label)).toEqual([
			"Current",
			"+1",
			"+2",
			"6 RPO",
			"8 RPO",
			"10 RPO",
		]);
		const test = match("TEST").toss("A", "BAT").open("a1", "a2", "b1").balls("1");
		expect(metrics.projectedScores(test.inn)).toEqual([]);
	});

	it("R-MET-03: dot-ball %, boundary %, balls per boundary", () => {
		const m = started().balls(". 4! 2 6!");
		const a1 = m.inn.batters[0]!;
		expect(metrics.batterDotPercent(a1)).toBe(25);
		expect(metrics.batterBoundaryPercent(a1)).toBeCloseTo((10 / 12) * 100);
		expect(metrics.ballsPerBoundary(a1)).toBe(2);
		expect(metrics.bowlerDotPercent(m.inn.bowlers[0]!)).toBe(25);
		const fresh = started().inn;
		expect(metrics.batterDotPercent(fresh.batters[0]!)).toBeNull();
		expect(metrics.batterBoundaryPercent(fresh.batters[0]!)).toBeNull();
		expect(metrics.ballsPerBoundary(fresh.batters[0]!)).toBeNull();
		expect(metrics.bowlerDotPercent(fresh.bowlers[0]!)).toBeNull();
	});

	it("R-MET-04: NRR counts an all-out side as facing its full overs", () => {
		const m = chase("4! 4! . . . .", "1 W").in("b3").balls("W");
		m.result();
		const a = nrrInput(m.state, "A")!;
		const b = nrrInput(m.state, "B")!;
		expect(a).toEqual({ runsFor: 8, oversFor: 1, runsAgainst: 1, oversAgainst: 1 });
		expect(b).toEqual({ runsFor: 1, oversFor: 1, runsAgainst: 8, oversAgainst: 1 });
		expect(netRunRate([a])).toBe(7);
		expect(netRunRate([a, b])).toBe(0);
		expect(netRunRate([])).toBeNull();
		const chased = chase("1 . . . . .", "4!").result();
		expect(nrrInput(chased.state, "B")).toEqual({
			runsFor: 4,
			oversFor: 1 / 6,
			runsAgainst: 1,
			oversAgainst: 1,
		});
	});

	it("R-MET-04: no-result, unfinished and multi-day matches are excluded from NRR", () => {
		const nr = started().event("MATCH_RESULT", { result: { kind: "NO_RESULT" }, override: false });
		expect(nrrInput(nr.state, "A")).toBeNull();
		expect(nrrInput(started().state, "A")).toBeNull();
		const forfeit = match("T20").toss("A", "BAT");
		forfeit.event("MATCH_RESULT", {
			result: { kind: "WIN", winnerTeamId: "A", margin: { type: "NONE" }, method: "FORFEIT" },
			override: false,
		});
		expect(nrrInput(forfeit.state, "A")).toBeNull();
		const test = match("TEST")
			.toss("A", "BAT")
			.event("MATCH_RESULT", { result: { kind: "DRAW" }, override: false });
		expect(nrrInput(test.state, "A")).toBeNull();
	});
});

describe("formatting", () => {
	it("R-MET-05: scorecard text includes batting, extras, FoW, bowling and result", () => {
		const m = chase("4! 1nb 1 2lb 1wd . . W", "6! 6!").result();
		const text = format.formatScorecard(m.state);
		expect(text).toContain("Team A innings");
		expect(text).toContain("Extras 5 (b 0, lb 2, w 2, nb 1, p 0)");
		expect(text).toContain("FoW: ");
		expect(text).toContain("Result: Team B won by 2 wickets");
		const pending = chase("4! . . . . .", "1 . . . . .");
		expect(format.formatScorecard(pending.state)).toContain("(awaiting confirmation)");
		expect(format.formatScorecard(started().state)).not.toContain("Result");
	});

	it("R-MET-05: names fall back to ids and results read naturally", () => {
		const m = started();
		expect(format.playerName(m.state, null)).toBe("");
		expect(format.playerName(m.state, "ghost")).toBe("ghost");
		expect(format.teamName(m.state, "Z")).toBe("Z");
		expect(format.resultText(m.state, { kind: "NO_RESULT" })).toBe("No result");
		expect(format.resultText(m.state, { kind: "ABANDONED" })).toBe("Match abandoned");
		expect(
			format.resultText(m.state, {
				kind: "WIN",
				winnerTeamId: "A",
				margin: { type: "WICKETS", wickets: 1, ballsRemaining: 1 },
				method: "NORMAL",
			}),
		).toBe("Team A won by 1 wicket (1 ball left)");
		expect(
			format.resultText(m.state, {
				kind: "WIN",
				winnerTeamId: "A",
				margin: { type: "WICKETS", wickets: 3, ballsRemaining: null },
				method: "NORMAL",
			}),
		).toBe("Team A won by 3 wickets");
		expect(
			format.resultText(m.state, {
				kind: "WIN",
				winnerTeamId: "A",
				margin: { type: "NONE" },
				method: "CONCEDED",
			}),
		).toBe("Team A won (concession)");
		expect(
			format.resultText(m.state, {
				kind: "WIN",
				winnerTeamId: "A",
				margin: { type: "NONE" },
				method: "NORMAL",
			}),
		).toBe("Team A won (decision)");
		expect(
			format.resultText(m.state, {
				kind: "WIN",
				winnerTeamId: "A",
				margin: { type: "NONE" },
				method: "TARGET_REVISION",
			}),
		).toBe("Team A won (decision)");
	});

	it("R-MET-06: auto-commentary describes each delivery", () => {
		const m = started();
		const say = (token: string, patch = {}): string => {
			const e = m.build("DELIVERY", { ...m.payloadFor(token), ...patch }) as DeliveryEvent;
			return format.deliveryCommentary(m.state, e);
		};
		expect(say("4!")).toBe("0.1 B1 to A1, FOUR!");
		expect(say("6!")).toBe("0.1 B1 to A1, SIX!");
		expect(say("W")).toBe("0.1 B1 to A1, OUT!");
		expect(say("wd")).toBe("0.1 B1 to A1, wide");
		expect(say("nb")).toBe("0.1 B1 to A1, no ball");
		expect(say("1b")).toBe("0.1 B1 to A1, 1 bye");
		expect(say("2b")).toBe("0.1 B1 to A1, 2 byes");
		expect(say("1lb")).toBe("0.1 B1 to A1, 1 leg bye");
		expect(say("2lb")).toBe("0.1 B1 to A1, 2 leg byes");
		expect(say(".")).toBe("0.1 B1 to A1, no run");
		expect(say("1")).toBe("0.1 B1 to A1, 1 run");
		expect(say("2")).toBe("0.1 B1 to A1, 2 runs");
		expect(say("2", { boundary: "FOUR", overthrow: true })).toBe("0.1 B1 to A1, 2 runs");
		const between = started().balls(". . . . . .").endOver();
		expect(
			format.deliveryCommentary(between.state, between.build("DELIVERY", between.payloadFor("."))),
		).toBe("");
		expect(
			format.deliveryCommentary(match("T20").state, m.build("DELIVERY", m.payloadFor("."))),
		).toBe("");
	});

	it("R-MET-06: ball labels in the over strip", () => {
		const m = started().balls("W").in("a3").balls("1wd 2nbb 1nblb 1+5p");
		expect(m.inn.currentOver!.balls.map((b) => b.label)).toEqual([
			"W",
			"2wd",
			"3nb",
			"2nb",
			"1+5p",
		]);
		const caughtOnWide = started().out("STUMPED", { ball: "wd" });
		expect(caughtOnWide.inn.currentOver!.balls[0]!.label).toBe("1wdW");
		const runOut = started().out("RUN_OUT", { ball: "1", end: "STRIKER" });
		expect(runOut.inn.currentOver!.balls[0]!.label).toBe("1W");
		const byeRunOut = started().out("RUN_OUT", { ball: "1b", end: "STRIKER" });
		expect(byeRunOut.inn.currentOver!.balls[0]!.label).toBe("1bW");
		const lbRunOut = started().out("RUN_OUT", { ball: "1lb", end: "STRIKER" });
		expect(lbRunOut.inn.currentOver!.balls[0]!.label).toBe("1lbW");
	});
});

describe("presets", () => {
	it("R-PRE-01: every preset is valid", () => {
		for (const rules of Object.values(PRESETS)) expect(() => validateRules(rules)).not.toThrow();
		expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
