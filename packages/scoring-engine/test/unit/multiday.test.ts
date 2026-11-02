import { describe, expect, it } from "vitest";
import { awaiting, followOnMargin, format } from "../../src";
import { match, type Scorebook } from "../dsl";

/** 3-a-side Test: two wickets end an innings. */
function test(rules = {}): Scorebook {
	return match("TEST", { players: 3, rules }).toss("A", "BAT");
}

/** Bat out an innings for `side` scoring `tokens` before losing both wickets. */
function innings(m: Scorebook, side: "A" | "B", tokens: string): Scorebook {
	const [x, y, z] = side === "A" ? ["a1", "a2", "a3"] : ["b1", "b2", "b3"];
	const bowler = side === "A" ? "b1" : "a1";
	m.open(x!, y!, bowler).balls(tokens).out("BOWLED");
	if (m.inn.status === "IN_PROGRESS") m.in(z!).out("BOWLED");
	return m;
}

describe("multi-day", () => {
	it("R-MD-01: innings alternate A, B, A, B and the last innings chases the aggregate", () => {
		const m = test();
		innings(m, "A", "4!");
		innings(m, "B", "1");
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "B", strikerId: "b1", nonStrikerId: "b2", bowlerId: "a1" },
			"WRONG_BATTING_TEAM",
		);
		innings(m, "A", "6!");
		m.open("b1", "b2", "a1");
		expect(m.inn.target).toBe(10);
		m.balls("6! 4!");
		expect(m.state.provisionalResult).toEqual({
			kind: "WIN",
			winnerTeamId: "B",
			margin: { type: "WICKETS", wickets: 2, ballsRemaining: null },
			method: "NORMAL",
		});
	});

	it("R-INN-03: only the batting side may declare, and only in multi-day cricket", () => {
		const m = test().open("a1", "a2", "b1").balls("4!");
		m.rejects("DECLARATION", { teamId: "B" }, "NOT_BATTING_TEAM");
		m.event("DECLARATION", { teamId: "A" });
		expect(m.inn.closeReason).toBe("DECLARED");
		expect(format.formatScorecard(m.state)).toContain("4/0 (0.1 ov) dec");
		const limited = match("T20").toss("A", "BAT").open("a1", "a2", "b1");
		limited.rejects("DECLARATION", { teamId: "A" }, "DECLARATION_NOT_ALLOWED");
	});

	it("R-MD-02: an innings can be forfeited, but not in limited-overs cricket", () => {
		const m = test();
		innings(m, "A", "4!");
		innings(m, "B", "1");
		expect(awaiting(m.state)).toContain("INNINGS_ENDED");
		m.event("INNINGS_ENDED", { reason: "FORFEITED" });
		expect(m.inn).toMatchObject({ battingTeamId: "A", runs: 0, closeReason: "FORFEITED" });
		expect(format.formatScorecard(m.state)).toContain("forfeited");
		m.open("b1", "b2", "a1");
		expect(m.inn.target).toBe(4);
		const limited = match("T20").toss("A", "BAT");
		limited.rejects("INNINGS_ENDED", { reason: "FORFEITED" }, "FORFEIT_NOT_ALLOWED");
		const done = test();
		innings(done, "A", "4!");
		innings(done, "B", "");
		innings(done, "A", "");
		innings(done, "B", "");
		done.rejects("INNINGS_ENDED", { reason: "FORFEITED" }, "NO_INNINGS_DUE");
	});

	it("R-MD-03: the match is drawn when time runs out", () => {
		const m = test().open("a1", "a2", "b1").balls("1");
		m.event("MATCH_RESULT", { result: { kind: "DRAW" }, override: false });
		expect(m.state.result).toEqual({ kind: "DRAW" });
		expect(format.resultText(m.state, m.state.result!)).toBe("Match drawn");
	});

	it("R-MD-04: follow-on margin depends on match length and must be decided", () => {
		expect([5, 4, 3, 2, 1].map((d) => followOnMargin(d, null))).toEqual([200, 150, 150, 100, 75]);
		expect(followOnMargin(null, null)).toBe(200);
		expect(followOnMargin(5, 50)).toBe(50);
		const m = test({ followOnMargin: 3 });
		innings(m, "A", "4!");
		m.rejects("FOLLOW_ON", { enforced: true }, "FOLLOW_ON_NOT_AVAILABLE");
		innings(m, "B", "1");
		expect(m.state.followOn).toEqual({ available: true, enforced: null });
		expect(awaiting(m.state)[0]).toBe("FOLLOW_ON");
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "A", strikerId: "a1", nonStrikerId: "a2", bowlerId: "b1" },
			"NO_INNINGS_DUE",
		);
		m.event("FOLLOW_ON", { enforced: true });
		m.rejects("FOLLOW_ON", { enforced: false }, "FOLLOW_ON_NOT_AVAILABLE");
		innings(m, "B", "");
		expect(m.innings(2).followOn).toBe(true);
		expect(format.formatScorecard(m.state)).toContain("(following on)");
	});

	it("R-MD-04: declining the follow-on sends the leading side back in", () => {
		const m = test({ followOnMargin: 3 });
		innings(m, "A", "4!");
		innings(m, "B", "");
		m.event("FOLLOW_ON", { enforced: false });
		m.open("a1", "a2", "b1");
		expect(m.inn.battingTeamId).toBe("A");
		const off = test({ followOnEnabled: false });
		innings(off, "A", "4!");
		innings(off, "B", "");
		expect(off.state.followOn.available).toBe(false);
	});

	it("R-MD-05: a side that has batted twice and is still behind loses by an innings", () => {
		const m = test({ followOnMargin: 3 });
		innings(m, "A", "6! 4!");
		innings(m, "B", "1");
		m.event("FOLLOW_ON", { enforced: true });
		innings(m, "B", "2");
		expect(m.state.provisionalResult).toEqual({
			kind: "WIN",
			winnerTeamId: "A",
			margin: { type: "INNINGS", runs: 7 },
			method: "NORMAL",
		});
		expect(format.resultText(m.state, m.state.provisionalResult!)).toBe(
			"Team A won by an innings and 7 runs",
		);
		const one = test({ followOnMargin: 3 });
		innings(one, "A", "4!");
		innings(one, "B", "");
		one.event("FOLLOW_ON", { enforced: true });
		innings(one, "B", "3");
		expect(format.resultText(one.state, one.state.provisionalResult!)).toBe(
			"Team A won by an innings and 1 run",
		);
	});

	it("R-MD-01: after a follow-on the side that batted once bats last", () => {
		const m = test({ followOnMargin: 3 });
		innings(m, "A", "4!");
		innings(m, "B", "");
		m.event("FOLLOW_ON", { enforced: true });
		innings(m, "B", "6!");
		m.open("a1", "a2", "b1");
		expect(m.inn).toMatchObject({ battingTeamId: "A", target: 3 });
	});

	it("R-MD-05: level after three innings means the last side needs one run", () => {
		const m = test({ followOnEnabled: false });
		innings(m, "A", "4!");
		innings(m, "B", "4!");
		innings(m, "A", "");
		expect(m.state.provisionalResult).toBeNull();
		m.open("b1", "b2", "a1");
		expect(m.inn.target).toBe(1);
	});

	it("R-MD-06: days advance at stumps", () => {
		const m = test().open("a1", "a2", "b1");
		m.event("INTERRUPTION", { kind: "STUMPS" });
		m.rejects("INTERRUPTION", { kind: "RAIN" }, "ALREADY_INTERRUPTED");
		m.rejects(
			"PLAY_RESUMED",
			{ revisedOvers: 10, revisedBowlerMaxOvers: null },
			"NOT_LIMITED_OVERS",
		);
		m.event("PLAY_RESUMED", { revisedOvers: null, revisedBowlerMaxOvers: null });
		expect(m.state.day).toBe(2);
		m.event("INTERRUPTION", { kind: "LUNCH" }).event("PLAY_RESUMED", {
			revisedOvers: null,
			revisedBowlerMaxOvers: null,
		});
		expect(m.state.day).toBe(2);
	});

	it("R-RES-04: multi-day ties only when the last side is out level; otherwise runs", () => {
		const tie = test({ followOnEnabled: false });
		innings(tie, "A", "4!");
		innings(tie, "B", "2");
		innings(tie, "A", "");
		innings(tie, "B", "2");
		expect(tie.state.provisionalResult).toEqual({ kind: "TIE" });
		const loss = test({ followOnEnabled: false });
		innings(loss, "A", "4!");
		innings(loss, "B", "2");
		innings(loss, "A", "");
		innings(loss, "B", "1");
		expect(loss.state.provisionalResult).toMatchObject({
			winnerTeamId: "A",
			margin: { type: "RUNS", runs: 1 },
		});
	});
});
