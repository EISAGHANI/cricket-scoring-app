import { describe, expect, it } from "vitest";
import { format } from "../../src";
import { eligibleBatters } from "../../src/reducer/context";
import { DISMISSAL_RULES, allowedDismissalKinds, creditsBowler } from "../../src/rules/dismissals";
import type { DeliveryDismissalKind } from "../../src/types/events";
import { started } from "../dsl";

const KINDS = Object.keys(DISMISSAL_RULES) as DeliveryDismissalKind[];

describe("dismissal matrix", () => {
	// Table-driven from CRICKET_RULES.md §8: each kind × delivery type × free hit.
	const deliveries = [
		{ name: "legal", ball: ".", freeHit: false },
		{ name: "wide", ball: "wd", freeHit: false },
		{ name: "no-ball", ball: "nb", freeHit: false },
		{ name: "bye", ball: "1b", freeHit: false },
		{ name: "free hit", ball: ".", freeHit: true },
	];
	for (const d of deliveries) {
		for (const kind of KINDS) {
			const extra =
				d.ball === "wd" ? "WIDE" : d.ball === "nb" ? "NO_BALL" : d.ball === "1b" ? "BYE" : null;
			const allowed = allowedDismissalKinds(extra, d.freeHit, true).includes(kind);
			it(`R-DIS-01: ${kind} on a ${d.name} is ${allowed ? "allowed" : "rejected"}`, () => {
				const m = started("T20", { rules: { allowHandledTheBall: true } });
				if (d.freeHit) m.balls("nb");
				const fielderIds = kind === "CAUGHT" ? ["b2"] : [];
				if (allowed) {
					m.out(kind, { ball: d.ball, fielderIds });
					expect(m.inn.wickets).toBe(1);
				} else {
					const p = m.payloadFor(d.ball);
					p.dismissal = m.dismissal(kind, { fielderIds });
					m.rejects("DELIVERY", p, "DISMISSAL_NOT_ALLOWED");
				}
			});
		}
	}

	it("R-DIS-01: handled the ball only when enabled", () => {
		expect(allowedDismissalKinds(null, false, false)).not.toContain("HANDLED_THE_BALL");
		const m = started();
		const p = m.payloadFor(".");
		p.dismissal = m.dismissal("HANDLED_THE_BALL");
		m.rejects("DELIVERY", p, "DISMISSAL_NOT_ALLOWED");
		m.rejects(
			"WICKET",
			{ kind: "HANDLED_THE_BALL", batterId: "a1", fielderIds: [] },
			"DISMISSAL_NOT_ALLOWED",
		);
	});

	it("R-DIS-01: striker-only dismissals and batters at the crease", () => {
		const m = started();
		const p = m.payloadFor(".");
		p.dismissal = m.dismissal("BOWLED", { batterId: "a2" });
		m.rejects("DELIVERY", p, "WRONG_BATTER");
		p.dismissal = m.dismissal("RUN_OUT", { batterId: "a5" });
		m.rejects("DELIVERY", p, "BATTER_NOT_AT_CREASE");
		const four = m.payloadFor("4!");
		four.dismissal = m.dismissal("RUN_OUT");
		m.rejects("DELIVERY", four, "DEAD_BALL_RUNS");
	});

	it("R-DIS-01: the ball is dead after a catch, so no runs can be recorded", () => {
		const m = started();
		const p = m.payloadFor("1");
		p.dismissal = m.dismissal("CAUGHT", { fielderIds: ["b2"] });
		m.rejects("DELIVERY", p, "DEAD_BALL_RUNS");
	});

	it("R-DIS-02: only bowler-credited kinds count to the bowler", () => {
		expect(KINDS.filter((k) => creditsBowler(k))).toEqual([
			"BOWLED",
			"CAUGHT",
			"LBW",
			"STUMPED",
			"HIT_WICKET",
		]);
		expect(creditsBowler("TIMED_OUT")).toBe(false);
		const m = started().out("LBW").in("a3").out("RUN_OUT", { end: "STRIKER" });
		expect(m.inn.bowlers[0]!.wickets).toBe(1);
		expect(m.inn.wickets).toBe(2);
	});

	it("R-DIS-03: a catch needs one fielder from the fielding side (substitutes allowed)", () => {
		const m = started();
		const p = m.payloadFor(".");
		p.dismissal = m.dismissal("CAUGHT", { fielderIds: [] });
		m.rejects("DELIVERY", p, "CATCHER_REQUIRED");
		p.dismissal = m.dismissal("CAUGHT", { fielderIds: ["a3"] });
		m.rejects("DELIVERY", p, "INVALID_FIELDER");
		m.out("CAUGHT", { fielderIds: ["bs1"] });
		const line = m.inn.batters[0]!;
		expect(format.dismissalText(m.state, m.inn, line)).toBe("c sub (BS1) b B1");
		m.in("a3").out("CAUGHT", { fielderIds: ["b1"] });
		expect(format.dismissalText(m.state, m.inn, m.inn.batters[2]!)).toBe("c & b B1");
		m.in("a4").out("CAUGHT", { fielderIds: ["b11"] });
		expect(format.dismissalText(m.state, m.inn, m.inn.batters[3]!)).toBe("c †B11 b B1");
	});

	it("R-DIS-04: only the keeper stumps; an empty fielder list means the keeper", () => {
		const m = started();
		const p = m.payloadFor(".");
		p.dismissal = m.dismissal("STUMPED", { fielderIds: ["b2"] });
		m.rejects("DELIVERY", p, "NOT_THE_KEEPER");
		p.dismissal = m.dismissal("STUMPED", { fielderIds: ["b11", "b2"] });
		m.rejects("DELIVERY", p, "NOT_THE_KEEPER");
		m.out("STUMPED", { ball: "wd" });
		expect(m.inn.batters[0]!.dismissal!.fielderIds).toEqual(["b11"]);
		expect(m.inn.runs).toBe(1);
		expect(format.dismissalText(m.state, m.inn, m.inn.batters[0]!)).toBe("st †B11 b B1");
	});

	it("R-DIS-05 R-STR-07: run out keeps completed runs; survivor stays at the other end", () => {
		const striker = started().out("RUN_OUT", {
			ball: "1",
			end: "STRIKER",
			fielderIds: ["b3", "b11"],
			directHit: true,
		});
		// a1 and a2 crossed for 1; the wicket at the striker's end is broken: a1 (now there) is out?
		expect(striker.inn.runs).toBe(1);
		expect(striker.inn.batters[0]!.runs).toBe(1);
		expect(striker.inn.nonStrikerId).toBe("a2");
		expect(striker.inn.strikerId).toBeNull();
		striker.in("a3");
		expect(striker.inn.strikerId).toBe("a3");
		expect(format.dismissalText(striker.state, striker.inn, striker.inn.batters[0]!)).toBe(
			"run out (B3/†B11)",
		);

		const nonStriker = started().out("RUN_OUT", { batterId: "a2", end: "NON_STRIKER" });
		expect(nonStriker.inn.strikerId).toBe("a1");
		nonStriker.in("a3");
		expect(nonStriker.inn.nonStrikerId).toBe("a3");
		const defaultEnd = started().out("RUN_OUT", { batterId: "a2" });
		expect(defaultEnd.inn.nonStrikerId).toBeNull();
		expect(format.dismissalText(defaultEnd.state, defaultEnd.inn, defaultEnd.inn.batters[1]!)).toBe(
			"run out",
		);
		const onNoBall = started().out("RUN_OUT", { ball: "1nb", end: "NON_STRIKER" });
		expect(onNoBall.inn.runs).toBe(2);
	});

	it("R-DIS-06: after a catch the new batter takes strike", () => {
		const m = started()
			.balls("1")
			.out("CAUGHT", { fielderIds: ["b2"] })
			.in("a3");
		expect(m.inn.strikerId).toBe("a3");
		expect(m.inn.nonStrikerId).toBe("a1");
	});

	it("R-DIS-06: on the last ball of the over the new batter ends up non-striker", () => {
		const m = started()
			.balls(". . . . .")
			.out("CAUGHT", { fielderIds: ["b2"] })
			.in("a3")
			.endOver();
		expect(m.inn.strikerId).toBe("a2");
		expect(m.inn.nonStrikerId).toBe("a3");
	});

	it("R-DIS-07: other striker dismissals vacate the striker's end", () => {
		for (const kind of ["BOWLED", "LBW", "HIT_WICKET", "HIT_BALL_TWICE"] as const) {
			const m = started().out(kind).in("a3");
			expect(m.inn.strikerId).toBe("a3");
		}
		const texts = ["b B1", "lbw b B1", "hit wicket b B1", "hit the ball twice"];
		const m = started()
			.out("BOWLED")
			.in("a3")
			.out("LBW")
			.in("a4")
			.out("HIT_WICKET")
			.in("a5")
			.out("HIT_BALL_TWICE");
		const out = m.inn.batters.filter((b) => b.status === "OUT");
		expect(out.map((b) => format.dismissalText(m.state, m.inn, b))).toEqual([
			texts[0],
			texts[1],
			texts[2],
			texts[3],
		]);
	});

	it("R-DIS-08: a run out without a delivery (backing up) is not a ball", () => {
		const m = started().event("WICKET", { kind: "RUN_OUT", batterId: "a2", fielderIds: ["b1"] });
		expect(m.inn.wickets).toBe(1);
		expect(m.inn.legalBalls).toBe(0);
		expect(m.inn.bowlers[0]!.wickets).toBe(0);
		expect(m.inn.nonStrikerId).toBeNull();
		m.rejects(
			"WICKET",
			{ kind: "RUN_OUT", batterId: "a7", fielderIds: [] },
			"BATTER_NOT_AT_CREASE",
		);
		m.rejects("WICKET", { kind: "RUN_OUT", batterId: "a1", fielderIds: ["a5"] }, "INVALID_FIELDER");
		m.in("a3").event("WICKET", { kind: "OBSTRUCTING_THE_FIELD", batterId: "a1", fielderIds: [] });
		expect(m.inn.strikerId).toBeNull();
		expect(format.dismissalText(m.state, m.inn, m.inn.batters[0]!)).toBe("obstructing the field");
	});

	it("R-DIS-09: a new batter must be eligible and is required before the next ball", () => {
		const m = started().out("BOWLED");
		m.rejectsBall(".", "BATTER_NEEDED");
		m.rejects("BATTER_IN", { batterId: "a1" }, "BATTER_NOT_ELIGIBLE");
		m.rejects("BATTER_IN", { batterId: "a2" }, "BATTER_NOT_ELIGIBLE");
		m.rejects("BATTER_IN", { batterId: "b3" }, "BATTER_NOT_ELIGIBLE");
		m.rejects("BATTER_IN", { batterId: "as1" }, "BATTER_NOT_ELIGIBLE");
		expect(eligibleBatters(m.state, m.inn)).toHaveLength(9);
		m.in("a7");
		expect(m.inn.batters[2]).toMatchObject({ playerId: "a7", position: 3, status: "BATTING" });
		m.rejects("BATTER_IN", { batterId: "a3" }, "NO_VACANCY");
	});

	it("R-DIS-10: timed out is recorded against the incoming batter", () => {
		const m = started().out("BOWLED");
		m.rejects(
			"WICKET",
			{ kind: "TIMED_OUT", batterId: "a1", fielderIds: [] },
			"BATTER_NOT_ELIGIBLE",
		);
		m.event("WICKET", { kind: "TIMED_OUT", batterId: "a3", fielderIds: [] });
		expect(m.inn.wickets).toBe(2);
		expect(m.inn.batters[2]).toMatchObject({ playerId: "a3", balls: 0, status: "OUT" });
		expect(format.dismissalText(m.state, m.inn, m.inn.batters[2]!)).toBe("timed out");
		m.in("a4");
		m.rejects("WICKET", { kind: "TIMED_OUT", batterId: "a5", fielderIds: [] }, "NO_VACANCY");
	});

	it("R-DIS-11: fall of wicket records score, overs and batter", () => {
		const m = started().balls("4! 1 . . . .").endOver().bowler("b2").balls("2").out("BOWLED");
		expect(m.inn.fallOfWickets).toEqual([
			{ wicketNo: 1, runs: 7, legalBalls: 8, overs: "1.2", batterId: "a1" },
		]);
	});
});

describe("dismissal edge cases", () => {
	it("R-DIS-01: handled the ball (legacy) when enabled", () => {
		const m = started("T20", { rules: { allowHandledTheBall: true } }).out("HANDLED_THE_BALL", {});
		expect(format.dismissalText(m.state, m.inn, m.inn.batters[0]!)).toBe("handled the ball");
	});

	it("R-DIS-10: a dismissal between overs has no bowler at the time", () => {
		const m = started().balls(". . . . .").out("BOWLED").endOver();
		m.event("WICKET", { kind: "TIMED_OUT", batterId: "a3", fielderIds: [] });
		expect(m.inn.batters[2]!.dismissal).toEqual({
			kind: "TIMED_OUT",
			bowlerId: null,
			bowlerAtTimeId: null,
			fielderIds: [],
		});
		expect(m.inn.overs[0]!.wickets).toBe(1);
	});

	it("R-DIS-09: two vacancies need two batters before a partnership starts", () => {
		const m = started().out("BOWLED").event("RETIREMENT", { batterId: "a2", kind: "HURT" });
		m.in("a3");
		expect(m.inn.partnerships).toHaveLength(1);
		m.in("a4");
		expect(m.inn.partnerships[1]!.batterIds).toEqual(["a3", "a4"]);
	});
});

describe("Last Man Stands", () => {
	it("R-LMS-01: the last batter bats alone and keeps strike", () => {
		const m = started("LAST_MAN_STANDS", { players: 3 }).out("BOWLED").in("a3").out("BOWLED");
		expect(m.inn.soloBatting).toBe(true);
		expect(m.inn.strikerId).toBe("a2");
		expect(m.inn.nonStrikerId).toBeNull();
		m.balls("1 1");
		expect(m.inn.strikerId).toBe("a2");
		m.balls(". .").endOver();
		expect(m.inn.strikerId).toBe("a2");
		m.rejects("SWAP_STRIKE", { reason: "x" }, "CANNOT_SWAP");
	});

	it("R-LMS-01: a returning batter bats alone when everyone else is out", () => {
		const m = started("LAST_MAN_STANDS", { players: 3 }).out("BOWLED").in("a3");
		m.event("RETIREMENT", { batterId: "a2", kind: "HURT" });
		m.event("WICKET", { kind: "RUN_OUT", batterId: "a3", fielderIds: [] });
		expect(m.inn.strikerId).toBeNull();
		m.in("a2");
		expect(m.inn).toMatchObject({ soloBatting: true, strikerId: "a2", nonStrikerId: null });
		expect(m.inn.partnerships.at(-1)!.batterIds).toEqual(["a2", null]);
		m.balls("1");
	});

	it("R-LMS-02: all out when every player is out", () => {
		const m = started("LAST_MAN_STANDS", { players: 3 })
			.out("BOWLED")
			.in("a3")
			.out("BOWLED")
			.out("BOWLED");
		expect(m.inn.wickets).toBe(3);
		expect(m.inn.status).toBe("COMPLETE");
		expect(m.inn.closeReason).toBe("ALL_OUT");
	});

	it("R-LMS-03: the last batter can be run out at either end", () => {
		const m = started("LAST_MAN_STANDS", { players: 3 }).out("BOWLED").in("a3").out("BOWLED");
		m.out("RUN_OUT", { ball: "1", end: "NON_STRIKER" });
		expect(m.inn.status).toBe("COMPLETE");
		const w = started("LAST_MAN_STANDS", { players: 3 }).out("BOWLED").in("a3").out("BOWLED");
		w.event("WICKET", { kind: "RUN_OUT", batterId: "a2", fielderIds: [] });
		expect(w.inn.status).toBe("COMPLETE");
	});
});

describe("retirements", () => {
	it("R-SUB-04: retired hurt is not a wicket and the batter may resume", () => {
		const m = started().balls("4!").event("RETIREMENT", { batterId: "a1", kind: "HURT" });
		expect(m.inn.wickets).toBe(0);
		expect(m.inn.batters[0]!.status).toBe("RETIRED_HURT");
		expect(format.dismissalText(m.state, m.inn, m.inn.batters[0]!)).toBe("retired hurt");
		expect(m.inn.partnerships[0]!.endedBy).toBe("RETIREMENT");
		m.in("a3").out("BOWLED").in("a1");
		expect(m.inn.batters[0]!.status).toBe("BATTING");
		expect(m.inn.batters[0]!.runs).toBe(4);
		m.rejects("RETIREMENT", { batterId: "a5", kind: "HURT" }, "BATTER_NOT_AT_CREASE");
	});

	it("R-SUB-04: when retired-hurt batters may not return, they cannot come back", () => {
		const m = started("T20", { rules: { retiredHurtMayReturn: false } }).event("RETIREMENT", {
			batterId: "a1",
			kind: "HURT",
		});
		m.in("a3").out("BOWLED");
		m.rejects("BATTER_IN", { batterId: "a1" }, "BATTER_NOT_ELIGIBLE");
	});

	it("R-SUB-04: an unbeaten retired batter shows as retired not out at the end", () => {
		const m = started("T20", { players: 3 })
			.event("RETIREMENT", { batterId: "a1", kind: "HURT" })
			.in("a3");
		m.out("BOWLED").event("INNINGS_ENDED", { reason: "ALL_OUT" });
		expect(m.inn.status).toBe("COMPLETE");
		const a1 = m.inn.batters[0]!;
		expect(format.dismissalText(m.state, m.inn, a1)).toBe("retired not out");
	});

	it("R-SUB-05: retired out counts as a wicket, not to the bowler", () => {
		const m = started().event("RETIREMENT", { batterId: "a2", kind: "OUT" });
		expect(m.inn.wickets).toBe(1);
		expect(m.inn.bowlers[0]!.wickets).toBe(0);
		expect(format.dismissalText(m.state, m.inn, m.inn.batters[1]!)).toBe("retired out");
	});

	it("R-INN-02: the innings can be closed when no batter is available (absent hurt)", () => {
		const m = started();
		m.rejects("INNINGS_ENDED", { reason: "ALL_OUT" }, "BATTERS_AVAILABLE");
		m.out("BOWLED").event("INNINGS_ENDED", { reason: "ALL_OUT" });
		expect(m.inn.closeReason).toBe("ALL_OUT");
	});
});
