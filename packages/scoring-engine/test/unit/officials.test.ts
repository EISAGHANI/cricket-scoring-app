import { describe, expect, it } from "vitest";
import { computeRevisedTarget, format, parScore, resultIfNoMorePlay } from "../../src";
import { eligibleBatters, eligibleBowlers } from "../../src/reducer/context";
import { dlsTarget, resources, validateResourceTable } from "../../src/target-revision/strategies";
import type { TargetRevisionStrategyId } from "../../src/types/rules";
import { SYNTHETIC_TABLE } from "../fixtures/synthetic-table";
import { match, started, type Scorebook } from "../dsl";

const res = (overs: number, wickets = 0): number => SYNTHETIC_TABLE.rows[overs]![wickets]!;

/** 4-over, 3-a-side match; A scores 22 with overs of 6, 4, 0 and 12. */
function firstInnings(targetRevision: TargetRevisionStrategyId, extra = {}): Scorebook {
	return match("T20", {
		overs: 4,
		players: 3,
		rules: { targetRevision, minOversForResult: 2, ...extra },
		engine: { resourceTable: SYNTHETIC_TABLE },
	})
		.toss("A", "BAT")
		.open("a1", "a2", "b1")
		.balls("1 1 1 1 1 1")
		.over("b2", "4! . . . . .")
		.over("b1", ". . . . . .")
		.over("b2", "6! 6! . . . .");
}

describe("penalty runs", () => {
	it("R-EXT-09: to a side that has not batted, they wait for its innings", () => {
		const m = started("T20", { overs: 1, players: 3 }).event("PENALTY_RUNS", {
			toTeamId: "B",
			runs: 5,
			reason: "fielding",
		});
		expect(m.state.pendingPenaltyRuns.B).toBe(5);
		m.balls(". . . . . .").open("b1", "b2", "a1");
		expect(m.inn).toMatchObject({ runs: 5, penaltyRunsOutsidePlay: 5 });
	});

	it("R-EXT-09: to the fielding side during a chase, they go to its last innings and raise the target", () => {
		const m = started("T20", { overs: 1, players: 3 }).balls("4! . . . . .").open("b1", "b2", "a1");
		expect(m.inn.target).toBe(5);
		m.event("PENALTY_RUNS", { toTeamId: "A", runs: 5, reason: "time wasting" });
		expect(m.innings(0)).toMatchObject({ runs: 9, penaltyRunsOutsidePlay: 5 });
		expect(m.inn.target).toBe(10);
	});

	it("R-EXT-09: between innings they update the provisional result", () => {
		const m = started("T20", { overs: 1, players: 3 })
			.balls("4! . . . . .")
			.open("b1", "b2", "a1")
			.balls("1 . . . . .");
		expect(m.state.provisionalResult).toMatchObject({ winnerTeamId: "A", margin: { runs: 3 } });
		m.event("PENALTY_RUNS", { toTeamId: "B", runs: 5, reason: "pitch damage" });
		expect(m.state.provisionalResult).toMatchObject({ winnerTeamId: "B" });
		m.rejects("PENALTY_RUNS", { toTeamId: "Z", runs: 5, reason: "x" }, "UNKNOWN_TEAM");
		m.rejects("PENALTY_RUNS", { toTeamId: "A", runs: 0, reason: "x" }, "INVALID_RUNS");
	});

	it("R-EXT-09: penalty runs during a vacancy join the next partnership", () => {
		const m = started()
			.out("BOWLED")
			.event("PENALTY_RUNS", { toTeamId: "A", runs: 5, reason: "x" });
		expect(m.inn.pendingPartnershipRuns).toBe(5);
		m.in("a3");
		expect(m.inn.partnerships[1]!.runs).toBe(5);
		const end = started("T20", { players: 2 }).event("PENALTY_RUNS", {
			toTeamId: "A",
			runs: 5,
			reason: "x",
		});
		end.event("RETIREMENT", { batterId: "a1", kind: "HURT" });
		end
			.event("PENALTY_RUNS", { toTeamId: "A", runs: 5, reason: "x" })
			.event("INNINGS_ENDED", { reason: "ALL_OUT" });
		expect(end.inn.pendingPartnershipRuns).toBe(5);
	});
});

describe("interruptions", () => {
	it("R-TR-01: no play while interrupted; revised overs may end the innings", () => {
		const m = firstInnings("ARR");
		m.open("b1", "b2", "a1").balls("1 1 1 1 1 1").endOver().bowler("a2").balls(". .");
		m.event("INTERRUPTION", { kind: "RAIN" });
		m.rejectsBall(".", "PLAY_INTERRUPTED");
		m.rejects("WICKET", { kind: "RUN_OUT", batterId: "b1", fielderIds: [] }, "PLAY_INTERRUPTED");
		m.rejects("PLAY_RESUMED", { revisedOvers: 1, revisedBowlerMaxOvers: null }, "INVALID_OVERS");
		m.rejects("PLAY_RESUMED", { revisedOvers: 0, revisedBowlerMaxOvers: null }, "INVALID_OVERS");
		m.rejects("PLAY_RESUMED", { revisedOvers: 5, revisedBowlerMaxOvers: null }, "INVALID_OVERS");
		m.rejects("PLAY_RESUMED", { revisedOvers: null, revisedBowlerMaxOvers: 0 }, "INVALID_OVERS");
		m.event("PLAY_RESUMED", { revisedOvers: 2, revisedBowlerMaxOvers: 1 });
		expect(m.inn.maxOvers).toBe(2);
		expect(m.inn.reductions).toEqual([
			{ legalBalls: 8, wickets: 0, oversBefore: 4, oversAfter: 2 },
		]);
		expect(m.state.bowlerMaxOversOverride).toBe(1);
		m.rejects(
			"PLAY_RESUMED",
			{ revisedOvers: null, revisedBowlerMaxOvers: null },
			"NOT_INTERRUPTED",
		);
	});

	it("R-TR-01: an interruption between innings can shorten the next innings", () => {
		const m = firstInnings("ARR").event("INTERRUPTION", { kind: "RAIN" });
		m.rejects(
			"INNINGS_STARTED",
			{ battingTeamId: "B", strikerId: "b1", nonStrikerId: "b2", bowlerId: "a1" },
			"PLAY_INTERRUPTED",
		);
		m.event("PLAY_RESUMED", { revisedOvers: 3, revisedBowlerMaxOvers: null }).open(
			"b1",
			"b2",
			"a1",
		);
		expect(m.inn.maxOvers).toBe(3);
		const shortened = started("T20", { overs: 4 }).balls("1 1 1 1 1 1").endOver();
		shortened
			.event("INTERRUPTION", { kind: "RAIN" })
			.event("PLAY_RESUMED", { revisedOvers: 1, revisedBowlerMaxOvers: null });
		expect(shortened.inn.closeReason).toBe("OVERS");
	});
});

describe("target revision", () => {
	it("R-TR-02: only the chase can be revised, with sane values", () => {
		const early = started("T20", { overs: 4, players: 3, rules: { targetRevision: "ARR" } });
		early.rejects("TARGET_REVISED", { target: 10, overs: 2, override: true }, "NO_CHASE");
		const m = firstInnings("ARR");
		m.rejects("TARGET_REVISED", { target: 10, overs: 0, override: true }, "INVALID_OVERS");
		m.rejects("TARGET_REVISED", { target: 0, overs: 2, override: true }, "INVALID_TARGET");
		m.rejects("TARGET_REVISED", { target: 10, overs: 2, override: false }, "TARGET_MISMATCH");
		m.open("b1", "b2", "a1").balls("1 1 1 1 1 1").endOver().bowler("a2").balls(".");
		m.rejects("TARGET_REVISED", { target: 10, overs: 1, override: true }, "INVALID_OVERS");
		const done = firstInnings("ARR").open("b1", "b2", "a1").out("BOWLED").in("b3").out("BOWLED");
		done.rejects("TARGET_REVISED", { target: 10, overs: 2, override: true }, "NO_CHASE");
	});

	it("R-TR-03: average run rate uses team 1's full allocation when all out", () => {
		const m = firstInnings("ARR");
		expect(computeRevisedTarget(m.state, 2, {})).toBe(12);
		m.event("TARGET_REVISED", { target: 12, overs: 2, override: false }).open("b1", "b2", "a1");
		expect(m.inn).toMatchObject({ target: 12, maxOvers: 2, targetRevised: true });
		m.balls("6! 6!");
		expect(format.resultText(m.state, m.state.provisionalResult!)).toBe(
			"Team B won by 2 wickets (10 balls left) (ARR method)",
		);
		const allOut = started("T20", { overs: 4, players: 3, rules: { targetRevision: "ARR" } })
			.balls("6! W")
			.in("a3")
			.balls("W");
		expect(computeRevisedTarget(allOut.state, 2, {})).toBe(4); // 6 runs over a full 4 overs → 3 per over
	});

	it("R-TR-04: most productive overs sums team 1's best overs", () => {
		const m = firstInnings("MPO");
		expect(computeRevisedTarget(m.state, 2, {})).toBe(19);
	});

	it("R-TR-05: DLS Standard-style target from the resource table (R2 < R1)", () => {
		const m = firstInnings("DLS_STANDARD");
		const expected = Math.floor((22 * res(2)) / res(4)) + 1;
		m.event("TARGET_REVISED", { target: expected, overs: 2, override: false });
		expect(m.state.pendingTarget).toEqual({ target: expected, overs: 2 });
		const noTable = firstInnings("DLS_STANDARD");
		expect(() => computeRevisedTarget(noTable.state, 2, {})).toThrowError(
			expect.objectContaining({ code: "NO_RESOURCE_TABLE" }),
		);
	});

	it("R-TR-05: DLS uses G50 when team 2 has more resources (R2 > R1)", () => {
		const m = match("T20", { overs: 4, players: 3, engine: { resourceTable: SYNTHETIC_TABLE } })
			.toss("A", "BAT")
			.open("a1", "a2", "b1")
			.balls("1 1 1 1 1 1")
			.over("b2", "4! . . . . .")
			.endOver();
		m.event("INTERRUPTION", { kind: "RAIN" }).event("PLAY_RESUMED", {
			revisedOvers: 2,
			revisedBowlerMaxOvers: null,
		});
		expect(m.inn.closeReason).toBe("OVERS");
		const r1 = res(4) - res(2);
		const expected = Math.floor(10 + (245 * (res(4) - r1)) / 100) + 1;
		expect(dlsTarget(10, r1, res(4), 245)).toBe(expected);
		m.event("TARGET_REVISED", { target: expected, overs: 4, override: false });
	});

	it("R-TR-05: interruptions during the chase reduce team 2's resources", () => {
		const m = firstInnings("DLS_STANDARD").open("b1", "b2", "a1").balls(". . . . . W").in("b3");
		m.endOver().event("INTERRUPTION", { kind: "RAIN" });
		const r2 = res(4) - (res(3, 1) - res(2, 1));
		const expected = Math.floor((22 * r2) / res(4)) + 1;
		m.event("TARGET_REVISED", { target: expected, overs: 3, override: false });
		expect(m.inn).toMatchObject({ target: expected, maxOvers: 3 });
		m.event("PLAY_RESUMED", { revisedOvers: null, revisedBowlerMaxOvers: null });
		expect(m.inn.reductions).toHaveLength(1);
		// A second revision at the same overs adds no further reduction.
		m.event("INTERRUPTION", { kind: "RAIN" }).event("TARGET_REVISED", {
			target: expected,
			overs: 3,
			override: true,
		});
		expect(m.inn.reductions).toHaveLength(1);
	});

	it("R-TR-05: resource tables are validated and interpolated", () => {
		expect(() => validateResourceTable(SYNTHETIC_TABLE)).not.toThrow();
		const bad = (rows: number[][]): void => {
			expect(() => validateResourceTable({ source: "x", rows })).toThrowError(
				expect.objectContaining({ code: "INVALID_RESOURCE_TABLE" }),
			);
		};
		const zero = Array(10).fill(0) as number[];
		bad([zero]);
		bad([zero, [1]]);
		bad([Array(10).fill(1) as number[], Array(10).fill(1) as number[]]);
		bad([zero, Array(10).fill(101) as number[]]);
		bad([zero, [5, 6, 0, 0, 0, 0, 0, 0, 0, 0]]);
		bad([zero, Array(10).fill(5) as number[], Array(10).fill(4) as number[]]);
		expect(resources(SYNTHETIC_TABLE, 2.5, 0)).toBeCloseTo((res(2) + res(3)) / 2);
		expect(resources(SYNTHETIC_TABLE, 80, 0)).toBe(res(50));
		expect(resources(SYNTHETIC_TABLE, 10, 10)).toBe(0);
		expect(resources(SYNTHETIC_TABLE, 0, 0)).toBe(0);
	});

	it("R-TR-06: par score for each strategy", () => {
		const arr = firstInnings("ARR")
			.open("b1", "b2", "a1")
			.balls("1 1 1 1 1 1")
			.endOver()
			.bowler("a2")
			.balls("1 1 1 1 1 1");
		expect(parScore(arr.state)).toBe(11);
		const mpo = firstInnings("MPO").open("b1", "b2", "a1").balls(".");
		expect(parScore(mpo.state)).toBe(12);
		const dls = firstInnings("DLS_STANDARD").open("b1", "b2", "a1").balls("1 1 1 1 1 1");
		const used = res(4) - res(3);
		expect(parScore(dls.state, { resourceTable: SYNTHETIC_TABLE })).toBe(
			Math.floor((22 * used) / res(4)),
		);
		expect(parScore(dls.state)).toBeNull();
		expect(parScore(firstInnings("MANUAL").open("b1", "b2", "a1").state)).toBeNull();
		expect(parScore(firstInnings("ARR").state)).toBeNull();
	});

	it("R-TR-07: manual targets require an override", () => {
		const m = firstInnings("MANUAL");
		m.rejects("TARGET_REVISED", { target: 15, overs: 3, override: false }, "MANUAL_TARGET");
		m.event("TARGET_REVISED", { target: 15, overs: 3, override: true }).open("b1", "b2", "a1");
		expect(m.inn.target).toBe(15);
	});

	it("R-TR-08: if play ends early the result depends on minimum overs and par", () => {
		const short = firstInnings("ARR").open("b1", "b2", "a1").balls("1");
		expect(resultIfNoMorePlay(short.state, {})).toEqual({ kind: "NO_RESULT" });
		short.rejects(
			"MATCH_RESULT",
			{ result: { kind: "ABANDONED" }, override: false },
			"RESULT_MISMATCH",
		);
		short.event("MATCH_RESULT", { result: { kind: "NO_RESULT" }, override: false });

		const ahead = firstInnings("ARR")
			.open("b1", "b2", "a1")
			.balls("6! 6! . . . .")
			.over("a2", ". . . . . .");
		expect(resultIfNoMorePlay(ahead.state, {})).toMatchObject({
			winnerTeamId: "B",
			margin: { type: "WICKETS" },
			method: "TARGET_REVISION",
		});
		const behind = firstInnings("ARR")
			.open("b1", "b2", "a1")
			.balls("1 . . . . .")
			.over("a2", ". . . . . .");
		expect(resultIfNoMorePlay(behind.state, {})).toEqual({
			kind: "WIN",
			winnerTeamId: "A",
			margin: { type: "RUNS", runs: 10 },
			method: "TARGET_REVISION",
		});
		expect(format.resultText(behind.state, resultIfNoMorePlay(behind.state, {})!)).toBe(
			"Team A won by 10 runs (ARR method)",
		);
		const level = firstInnings("ARR")
			.open("b1", "b2", "a1")
			.balls("6! 4! 1 . . .")
			.over("a2", ". . . . . .");
		expect(resultIfNoMorePlay(level.state, {})).toEqual({ kind: "TIE" });
		const noTable = firstInnings("DLS_STANDARD")
			.open("b1", "b2", "a1")
			.balls(". . . . . .")
			.over("a2", ". . . . . .");
		expect(resultIfNoMorePlay(noTable.state, {})).toBeNull();
		expect(resultIfNoMorePlay(firstInnings("ARR").state, {})).toBeNull();
	});
});

describe("substitutions", () => {
	it("R-SUB-01: substitutes field but do not join the XI", () => {
		const m = started().event("SUBSTITUTION", {
			kind: "FIELDING",
			teamId: "B",
			outPlayerId: "b2",
			inPlayerId: "bs1",
		});
		expect(m.state.players.bs1!.role).toBe("SUBSTITUTE");
		m.rejects(
			"SUBSTITUTION",
			{ kind: "FIELDING", teamId: "B", outPlayerId: "b2", inPlayerId: "zz" },
			"UNKNOWN_PLAYER",
		);
		m.rejects(
			"SUBSTITUTION",
			{ kind: "FIELDING", teamId: "B", outPlayerId: "bs1", inPlayerId: "bs2" },
			"INVALID_SUBSTITUTION",
		);
		m.rejects(
			"SUBSTITUTION",
			{ kind: "FIELDING", teamId: "A", outPlayerId: "b2", inPlayerId: "bs1" },
			"UNKNOWN_PLAYER",
		);
	});

	it("R-SUB-02: a concussion replacement inherits the replaced player's state", () => {
		const m = started().out("BOWLED");
		m.rejects(
			"SUBSTITUTION",
			{ kind: "CONCUSSION", teamId: "A", outPlayerId: "a2", inPlayerId: "as1" },
			"PLAYER_AT_CREASE",
		);
		m.rejects(
			"SUBSTITUTION",
			{ kind: "CONCUSSION", teamId: "B", outPlayerId: "b1", inPlayerId: "bs1" },
			"PLAYER_BOWLING",
		);
		m.event("SUBSTITUTION", {
			kind: "CONCUSSION",
			teamId: "A",
			outPlayerId: "a1",
			inPlayerId: "as1",
		});
		expect(eligibleBatters(m.state, m.inn)).not.toContain("as1"); // a1 was out
		m.event("SUBSTITUTION", {
			kind: "CONCUSSION",
			teamId: "A",
			outPlayerId: "a9",
			inPlayerId: "as2",
		});
		expect(eligibleBatters(m.state, m.inn)).toContain("as2"); // a9 had not batted
		expect(eligibleBatters(m.state, m.inn)).not.toContain("a9");
		const off = started("T20", { rules: { concussionReplacements: false } });
		off.rejects(
			"SUBSTITUTION",
			{ kind: "CONCUSSION", teamId: "A", outPlayerId: "a9", inPlayerId: "as1" },
			"NOT_ALLOWED",
		);
	});

	it("R-SUB-02: the replacement's bowling quota includes the replaced player's overs, and keeping passes on", () => {
		const m = started("T20", { rules: { bowlerMaxOvers: 1 } })
			.balls(". . . . . .")
			.endOver()
			.bowler("b2");
		m.event("SUBSTITUTION", {
			kind: "CONCUSSION",
			teamId: "B",
			outPlayerId: "b1",
			inPlayerId: "bs1",
		});
		m.event("SUBSTITUTION", {
			kind: "CONCUSSION",
			teamId: "B",
			outPlayerId: "b11",
			inPlayerId: "bs2",
		});
		expect(m.state.keepers.B).toBe("bs2");
		m.balls(". . . . . .").endOver();
		expect(eligibleBowlers(m.state, m.inn).find((b) => b.playerId === "bs1")).toMatchObject({
			eligible: false,
			reason: "QUOTA_REACHED",
		});
		expect(eligibleBowlers(m.state, m.inn).some((b) => b.playerId === "b1")).toBe(false);
	});

	it("R-SUB-03: impact players are limited per team and the replaced player is gone", () => {
		const m = started("T20", { rules: { impactPlayersPerTeam: 1 } });
		m.event("SUBSTITUTION", { kind: "IMPACT", teamId: "A", outPlayerId: "a11", inPlayerId: "as1" });
		expect(m.state.impactSubstitutionsUsed.A).toBe(1);
		expect(eligibleBatters(m.state, m.inn)).toContain("as1");
		expect(eligibleBatters(m.state, m.inn)).not.toContain("a11");
		m.rejects(
			"SUBSTITUTION",
			{ kind: "IMPACT", teamId: "A", outPlayerId: "a10", inPlayerId: "as2" },
			"NOT_ALLOWED",
		);
		const none = started();
		none.rejects(
			"SUBSTITUTION",
			{ kind: "IMPACT", teamId: "A", outPlayerId: "a10", inPlayerId: "as2" },
			"NOT_ALLOWED",
		);
	});

	it("R-SUB-03: no more than playersPerSide distinct batters", () => {
		const m = started("T20", {
			players: 3,
			rules: { impactPlayersPerTeam: 1, lastManStands: true },
		});
		m.out("BOWLED").in("a3");
		m.event("SUBSTITUTION", { kind: "IMPACT", teamId: "A", outPlayerId: "a1", inPlayerId: "as1" });
		m.out("BOWLED");
		expect(m.inn.soloBatting).toBe(true);
		expect(eligibleBatters(m.state, m.inn)).toEqual([]);
	});
});
