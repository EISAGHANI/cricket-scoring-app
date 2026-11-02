import { describe, expect, it } from "vitest";
import { awaiting, format } from "../../src";
import type { TieBreaker } from "../../src/types/rules";
import { match, type Scorebook } from "../dsl";

/** 1-over, 3-a-side match tied at 4. */
function tied(tieBreaker: TieBreaker): Scorebook {
	return match("T20", { overs: 1, players: 3, rules: { tieBreaker } })
		.toss("A", "BAT")
		.open("a1", "a2", "b1")
		.balls("4! . . . . .")
		.open("b1", "b2", "a1")
		.balls("2 2 . . . .");
}

describe("ties and super overs", () => {
	it("R-RES-03: with no tie-breaker the tie stands", () => {
		const m = tied("NONE");
		expect(m.state.provisionalResult).toEqual({ kind: "TIE" });
		expect(format.resultText(m.state, { kind: "TIE" })).toBe("Match tied");
	});

	it("R-SO-01: the side batting second bats first in the super over", () => {
		const m = tied("SUPER_OVER");
		expect(m.state.provisionalResult).toBeNull();
		expect(awaiting(m.state)[0]).toBe("SUPER_OVER_STARTED");
		m.rejects("SUPER_OVER_STARTED", { round: 2 }, "WRONG_ROUND");
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "B", strikerId: "b1", nonStrikerId: "b2", bowlerId: "a1" },
			"NO_INNINGS_DUE",
		);
		m.event("SUPER_OVER_STARTED", { round: 1 });
		m.rejects("SUPER_OVER_STARTED", { round: 2 }, "NO_SUPER_OVER_DUE");
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "A", strikerId: "a1", nonStrikerId: "a2", bowlerId: "b1" },
			"WRONG_BATTING_TEAM",
		);
		m.open("b1", "b2", "a1");
		expect(m.inn).toMatchObject({
			kind: "SUPER_OVER",
			superOverRound: 1,
			maxOvers: 1,
			maxWickets: 2,
		});
	});

	it("R-SO-04: a super-over innings ends after its balls or two wickets", () => {
		const m = tied("SUPER_OVER").event("SUPER_OVER_STARTED", { round: 1 }).open("b1", "b2", "a1");
		m.out("BOWLED").in("b3").out("BOWLED");
		expect(m.inn.closeReason).toBe("ALL_OUT");
		m.open("a1", "a2", "b1");
		expect(m.inn.target).toBe(1);
		m.balls(". . . . . .");
		expect(m.inn.closeReason).toBe("OVERS");
		expect(m.state.provisionalResult).toEqual({ kind: "TIE" });
		expect(format.formatScorecard(m.state)).toContain("Super over 1: Team A");
	});

	it("R-RES-03: the super over decides the winner either way", () => {
		const chaseWins = tied("SUPER_OVER")
			.event("SUPER_OVER_STARTED", { round: 1 })
			.open("b1", "b2", "a1");
		chaseWins.balls("1 . . . . .").open("a1", "a2", "b1").balls("2");
		expect(chaseWins.state.provisionalResult).toEqual({
			kind: "WIN",
			winnerTeamId: "A",
			margin: { type: "NONE" },
			method: "SUPER_OVER",
		});
		expect(format.resultText(chaseWins.state, chaseWins.state.provisionalResult!)).toBe(
			"Team A won (the super over)",
		);
		const defendWins = tied("SUPER_OVER")
			.event("SUPER_OVER_STARTED", { round: 1 })
			.open("b1", "b2", "a1");
		defendWins.balls("4! . . . . .").open("a1", "a2", "b1").balls(". . . . . .");
		expect(defendWins.state.provisionalResult).toMatchObject({
			winnerTeamId: "B",
			method: "SUPER_OVER",
		});
	});

	it("R-SO-02: batters out in one super over cannot bat in the next", () => {
		const m = tied("SUPER_OVER_REPEAT")
			.event("SUPER_OVER_STARTED", { round: 1 })
			.open("b1", "b2", "a1");
		m.out("BOWLED").in("b3").balls("1 . . . .");
		m.open("a1", "a2", "b1").balls("1 . . . . .");
		expect(m.state.provisionalResult).toBeNull();
		expect(awaiting(m.state)[0]).toBe("SUPER_OVER_STARTED");
		m.event("SUPER_OVER_STARTED", { round: 2 });
		// Round 2: the side that batted second in round 1 (A) bats first.
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "B", strikerId: "b2", nonStrikerId: "b3", bowlerId: "a3" },
			"WRONG_BATTING_TEAM",
		);
		m.open("a1", "a2", "b2").balls(". . . . . .");
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "B", strikerId: "b1", nonStrikerId: "b2", bowlerId: "a3" },
			"BATTER_NOT_ELIGIBLE",
		);
		m.open("b2", "b3", "a3");
		expect(m.inn.superOverRound).toBe(2);
	});

	it("R-SO-03: a bowler from the previous super over cannot bowl in the next", () => {
		const m = tied("SUPER_OVER_REPEAT")
			.event("SUPER_OVER_STARTED", { round: 1 })
			.open("b1", "b2", "a1");
		m.balls("1 . . . . .").open("a1", "a2", "b1").balls("1 . . . . .");
		m.event("SUPER_OVER_STARTED", { round: 2 });
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "A", strikerId: "a1", nonStrikerId: "a2", bowlerId: "b1" },
			"BOWLER_BOWLED_PREVIOUS_SUPER_OVER",
		);
		m.open("a1", "a2", "b2").balls(". . . . . .");
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "B", strikerId: "b1", nonStrikerId: "b2", bowlerId: "a1" },
			"BOWLER_BOWLED_PREVIOUS_SUPER_OVER",
		);
		m.open("b1", "b2", "a2").balls("1");
		expect(m.state.provisionalResult).toMatchObject({ winnerTeamId: "B", method: "SUPER_OVER" });
	});

	it("R-RES-03: boundary count decides a tied super over (2019 rule)", () => {
		const m = tied("SUPER_OVER_THEN_BOUNDARY_COUNT")
			.event("SUPER_OVER_STARTED", { round: 1 })
			.open("b1", "b2", "a1");
		m.balls("1 . . . . .").open("a1", "a2", "b1").balls("1 . . . . .");
		// A hit one four in regulation, B none.
		expect(m.state.provisionalResult).toEqual({
			kind: "WIN",
			winnerTeamId: "A",
			margin: { type: "NONE" },
			method: "BOUNDARY_COUNT",
		});
		expect(format.resultText(m.state, m.state.provisionalResult!)).toBe(
			"Team A won (boundary count)",
		);
		const level = tied("SUPER_OVER_THEN_BOUNDARY_COUNT")
			.event("SUPER_OVER_STARTED", { round: 1 })
			.open("b1", "b2", "a1");
		level.balls("4! . . . . .").open("a1", "a2", "b1").balls("2 2 . . . .");
		// A: 1 four in regulation + 0 = 1; B: 0 + 1 = 1 → still tied.
		expect(level.state.provisionalResult).toEqual({ kind: "TIE" });
		const bWins = tied("SUPER_OVER_THEN_BOUNDARY_COUNT")
			.event("SUPER_OVER_STARTED", { round: 1 })
			.open("b1", "b2", "a1");
		bWins.balls("4! 4! . . . .").open("a1", "a2", "b1").balls("2 2 2 2 . .");
		// A: 1 + 0 = 1; B: 0 + 2 = 2.
		expect(bWins.state.provisionalResult).toMatchObject({
			winnerTeamId: "B",
			method: "BOUNDARY_COUNT",
		});
	});

	it("R-RES-03: a bowl-out result is recorded", () => {
		const m = tied("BOWL_OUT");
		expect(awaiting(m.state)[0]).toBe("BOWL_OUT_RESULT");
		m.rejects("BOWL_OUT_RESULT", { winnerTeamId: "Z" }, "UNKNOWN_TEAM");
		m.event("BOWL_OUT_RESULT", { winnerTeamId: "B" });
		expect(m.state.provisionalResult).toEqual({
			kind: "WIN",
			winnerTeamId: "B",
			margin: { type: "NONE" },
			method: "BOWL_OUT",
		});
		m.rejects("BOWL_OUT_RESULT", { winnerTeamId: "A" }, "NO_BOWL_OUT_DUE");
		expect(format.resultText(m.state, m.state.provisionalResult!)).toBe(
			"Team B won (the bowl-out)",
		);
	});
});
