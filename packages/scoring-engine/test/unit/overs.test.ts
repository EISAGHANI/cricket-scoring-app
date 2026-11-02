import { describe, expect, it } from "vitest";
import { eligibleBowlers } from "../../src/reducer/context";
import { format } from "../../src";
import { started } from "../dsl";

describe("overs", () => {
	it("R-OV-01: after six legal balls the over is due and further balls are rejected", () => {
		const m = started().balls("1 1 wd 1 1 1 1");
		expect(m.inn.currentOver!.legalBalls).toBe(6);
		m.rejectsBall(".", "OVER_COMPLETE");
	});

	it("R-OV-01: an umpire's extra ball can be recorded with overMiscount", () => {
		const m = started().balls(". . . . . .").ball({ overMiscount: true, runs: 1 });
		expect(m.inn.currentOver!.legalBalls).toBe(7);
		expect(m.inn.currentOver!.miscount).toBe(true);
		m.endOver();
		expect(m.inn.completedOvers).toBe(1);
		const fresh = started();
		fresh.rejectsBall({ overMiscount: true }, "NOT_A_MISCOUNT");
	});

	it("R-OV-02: END_OF_OVER before the over is due needs reason MISCOUNT", () => {
		const m = started().balls(". . . . .");
		m.rejects("END_OF_OVER", { reason: "NORMAL" }, "OVER_NOT_COMPLETE");
		m.endOver("MISCOUNT");
		expect(m.inn.completedOvers).toBe(1);
		expect(m.inn.overs[0]!.miscount).toBe(true);
		m.rejects("END_OF_OVER", { reason: "NORMAL" }, "NO_OVER_IN_PROGRESS");
	});

	it("R-OV-03: batters change ends at the end of the over", () => {
		const m = started().balls(". . . . . .").endOver();
		expect(m.inn.strikerId).toBe("a2");
		expect(m.inn.nonStrikerId).toBe("a1");
	});

	it("R-OV-04: a maiden needs a full over with nothing charged to the bowler", () => {
		const m = started().balls(". 1lb . 1b . .").endOver();
		expect(m.inn.bowlers[0]!.maidens).toBe(1);
		m.over("b2", ". wd . . . . .").endOver();
		expect(m.inn.bowlers.find((b) => b.playerId === "b2")!.maidens).toBe(0);
	});

	it("R-OV-04: a shared over is never a maiden", () => {
		const m = started().balls(". .").bowler("b2", "INJURY").balls(". . . .").endOver();
		expect(m.inn.bowlers.every((b) => b.maidens === 0)).toBe(true);
	});

	it("R-OV-05: a new over needs an eligible bowler", () => {
		const m = started("T20", { rules: { bowlerMaxOvers: 1 } })
			.balls(". . . . . .")
			.endOver();
		expect(eligibleBowlers(m.state, m.inn).find((b) => b.playerId === "b1")).toMatchObject({
			eligible: false,
			reason: "QUOTA_REACHED",
		});
		m.rejectsBall(".", "BOWLER_NEEDED");
		m.rejects("BOWLER_CHANGE", { bowlerId: "b1", reason: "NEW_OVER" }, "BOWLER_QUOTA_REACHED");
		m.rejects("BOWLER_CHANGE", { bowlerId: "a3", reason: "NEW_OVER" }, "BOWLER_NOT_IN_FIELDING_XI");
		m.rejects("BOWLER_CHANGE", { bowlerId: "b2", reason: "INJURY" }, "INVALID_REASON");
		m.bowler("b2").balls(". . . . . .").endOver();
		const unlimited = started().balls(". . . . . .").endOver();
		unlimited.rejects(
			"BOWLER_CHANGE",
			{ bowlerId: "b1", reason: "NEW_OVER" },
			"BOWLER_BOWLED_PREVIOUS_OVER",
		);
		expect(m.inn.completedOvers).toBe(2);
	});

	it("R-OV-05: changing the selected bowler before the first ball", () => {
		const m = started().balls(". . . . . .").endOver().bowler("b2");
		m.bowler("b3", "OTHER");
		expect(m.inn.currentOver!.bowlerIds).toEqual(["b3"]);
		expect(m.inn.bowlers.some((b) => b.playerId === "b2")).toBe(false);
		m.rejects("BOWLER_CHANGE", { bowlerId: "b1", reason: "OTHER" }, "BOWLER_BOWLED_PREVIOUS_OVER");
		const keep = started()
			.balls(". . . . . .")
			.endOver()
			.bowler("b2")
			.balls(". . . . . .")
			.endOver()
			.bowler("b1");
		keep.bowler("b3", "OTHER");
		expect(keep.inn.bowlers.find((b) => b.playerId === "b1")!.oversStarted).toBe(1);
	});

	it("R-OV-06: a mid-over change is completed by someone who did not bowl the previous over", () => {
		const m = started().balls(". . . . . .").endOver().bowler("b2").balls("1");
		m.rejects("BOWLER_CHANGE", { bowlerId: "b1", reason: "INJURY" }, "BOWLER_BOWLED_PREVIOUS_OVER");
		m.rejects("BOWLER_CHANGE", { bowlerId: "b2", reason: "INJURY" }, "BOWLER_ALREADY_IN_THIS_OVER");
		m.rejects("BOWLER_CHANGE", { bowlerId: "b3", reason: "NEW_OVER" }, "OVER_IN_PROGRESS");
		m.bowler("b3", "SUSPENDED").balls(". . . . .");
		expect(m.inn.currentOver!.bowlerIds).toEqual(["b2", "b3"]);
		m.rejects("BOWLER_CHANGE", { bowlerId: "b4", reason: "INJURY" }, "OVER_COMPLETE");
		m.endOver();
		// Neither b2 nor b3 may bowl the next over; b2 is suspended for the innings.
		m.rejects(
			"BOWLER_CHANGE",
			{ bowlerId: "b3", reason: "NEW_OVER" },
			"BOWLER_BOWLED_PREVIOUS_OVER",
		);
		m.rejects("BOWLER_CHANGE", { bowlerId: "b2", reason: "NEW_OVER" }, "BOWLER_SUSPENDED");
		expect(m.inn.bowlers.find((b) => b.playerId === "b3")!.legalBalls).toBe(5);
	});

	it("R-OV-06: quota still binds a bowler completing an over", () => {
		const m = started("T20", { rules: { bowlerMaxOvers: 1 } })
			.balls(". . . . . .")
			.endOver()
			.bowler("b2")
			.balls(". . . . . .")
			.endOver()
			.bowler("b3")
			.balls(".");
		m.rejects("BOWLER_CHANGE", { bowlerId: "b1", reason: "INJURY" }, "BOWLER_QUOTA_REACHED");
		const balls = started("HUNDRED", {
			rules: { bowlerMaxBalls: 5, maxConsecutiveOvers: 1, oversPerEnd: 1 },
		})
			.balls(". . . . .")
			.endOver()
			.bowler("b2")
			.balls(". . . . .")
			.endOver()
			.bowler("b3")
			.balls(".");
		balls.rejects("BOWLER_CHANGE", { bowlerId: "b1", reason: "INJURY" }, "BOWLER_QUOTA_REACHED");
	});

	it("R-OV-07: overs are written O.B from legal balls", () => {
		const m = started().balls(". . . . . .").endOver().bowler("b2").balls("wd . .");
		expect(format.formatOvers(m.state, m.inn)).toBe("1.2");
		expect(format.bowlerOversText(8, 6)).toBe("1.2");
		expect(format.bowlerOversText(12, 6)).toBe("2");
	});

	it("R-OV-08: The Hundred has 5-ball sets, two in a row from one end, and 20-ball quotas", () => {
		const m = started("HUNDRED").balls(". . . . .").endOver();
		expect(m.inn.strikerId).toBe("a1"); // same end: no change
		m.bowler("b1").balls(". . . . .").endOver();
		expect(m.inn.strikerId).toBe("a2");
		m.rejects(
			"BOWLER_CHANGE",
			{ bowlerId: "b1", reason: "NEW_OVER" },
			"BOWLER_BOWLED_PREVIOUS_OVER",
		);
		m.over("b2", ". . . . .")
			.over("b2", ". . . . .")
			.over("b1", ". . . . .")
			.over("b1", ". . . . .")
			.endOver();
		m.rejects("BOWLER_CHANGE", { bowlerId: "b1", reason: "NEW_OVER" }, "BOWLER_QUOTA_REACHED");
		expect(format.formatOvers(m.state, m.inn)).toBe("30 balls");
	});
});
