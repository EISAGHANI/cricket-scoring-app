import { describe, expect, it } from "vitest";
import { RuleViolation, replay, replayFrom, resolveLog } from "../../src";
import { must } from "../../src/internal/must";
import { clone } from "../../src/internal/clone";
import type { PlayEvent } from "../../src/types/events";
import { started } from "../dsl";

describe("undo", () => {
	it("R-UNDO-01: only the latest effective event can be undone", () => {
		const m = started().balls("1 2");
		const firstBall = must(
			m.log.find((e) => e.type === "DELIVERY"),
			"ball",
		).id;
		expect(() => m.undo(firstBall)).toThrowError(
			expect.objectContaining({ code: "UNDO_NOT_LATEST", rule: "R-UNDO-01" }),
		);
		m.undo();
		expect(m.inn.runs).toBe(1);
		m.undo();
		expect(m.inn.runs).toBe(0);
	});

	it("R-UNDO-02: log + UNDO(e) replays exactly like the log without e", () => {
		const base = started().balls("1 4! wd");
		const without = clone(base.log);
		base.out("CAUGHT", { fielderIds: ["b3"] }).undo();
		expect(base.state).toEqual(replay(without));
	});

	it("R-UNDO-03: undoing an UNDO is a redo; new events clear the redo stack", () => {
		const m = started().balls("1 4!");
		const before = clone(m.state);
		m.undo();
		const undoId = m.log[m.log.length - 1]!.id;
		m.undo(undoId);
		expect(m.state).toEqual(before);
		// After a new event the old UNDO can no longer be redone.
		m.undo();
		const undo2 = m.log[m.log.length - 1]!.id;
		m.balls(".");
		expect(() => m.undo(undo2)).toThrowError(expect.objectContaining({ code: "UNDO_NOT_LATEST" }));
	});

	it("R-UNDO-04: MATCH_STARTED cannot be undone", () => {
		const m = started();
		const startId = m.log[0]!.id;
		const log = [
			m.log[0]!,
			{ id: "u", seq: 2, type: "UNDO" as const, payload: { targetId: startId } },
		];
		expect(() => replay(log)).toThrowError(
			expect.objectContaining({ code: "CANNOT_UNDO", seq: 2 }),
		);
	});
});

describe("corrections", () => {
	it("R-COR-01: a correction rewrites a past event and the match replays", () => {
		const m = started()
			.out("CAUGHT", { fielderIds: ["b3"] })
			.in("a3")
			.balls("1 2");
		const wicket = must(
			m.log.find((e) => e.type === "DELIVERY"),
			"wicket ball",
		);
		if (wicket.type !== "DELIVERY") throw new Error("unreachable");
		m.correct(wicket.id, { dismissal: { ...wicket.payload.dismissal, fielderIds: ["b4"] } });
		expect(m.inn.batters[0]!.dismissal!.fielderIds).toEqual(["b4"]);
		expect(m.inn.runs).toBe(3);
	});

	it("R-COR-01: corrections are limited to correctable fields and effective targets", () => {
		const m = started().balls("1");
		const ball = m.log[m.log.length - 1]!.id;
		expect(() => m.correct(ball, { overMiscount: true })).toThrowError(
			expect.objectContaining({ code: "CORRECTION_FIELD" }),
		);
		expect(() => m.correct("nope", { runs: 2 })).toThrowError(
			expect.objectContaining({ code: "CORRECTION_TARGET" }),
		);
		expect(() => m.correct(m.log[0]!.id, { rules: {} })).toThrowError(
			expect.objectContaining({ code: "CORRECTION_FIELD" }),
		);
	});

	it("R-COR-01: a correction that breaks a later event is rejected with that event's seq", () => {
		const m = started().balls("1 2");
		const first = m.log.find((e) => e.type === "DELIVERY")!;
		const second = m.log[m.log.length - 1]!;
		m.out("BOWLED"); // a2 (striker after the single) is bowled
		const before = m.state;
		let error: unknown = null;
		try {
			// Making the single a dot puts a1 on strike, so the wicket's batter is wrong.
			m.correct(first.id, { runs: 0 });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(RuleViolation);
		expect((error as RuleViolation).seq).toBe(second.seq + 1);
		expect(m.state).toBe(before);
	});

	it("R-COR-02: later corrections win per field, and corrections can be undone", () => {
		const m = started().balls("1");
		const ball = m.log[m.log.length - 1]!.id;
		m.correct(ball, { runs: 2 }).correct(ball, { runs: 3 });
		expect(m.inn.runs).toBe(3);
		m.undo();
		expect(m.inn.runs).toBe(2);
		expect(resolveLog(m.log).filter((e) => e.type === "DELIVERY")).toHaveLength(1);
	});
});

describe("snapshots", () => {
	it("R-LC-05: replaying from a snapshot equals a full replay", () => {
		const m = started().balls("1 2 3 . . 4!").endOver();
		const k = m.log.length;
		const snapshot = replay(m.log);
		m.over("b2", "1 wd 2 W").in("a3").balls("6!");
		const tail = m.log.slice(k) as PlayEvent[];
		expect(replayFrom(snapshot, tail)).toEqual(replay(m.log));
	});

	it("clone and must are plain helpers", () => {
		expect(clone({ a: [1, { b: null }] })).toEqual({ a: [1, { b: null }] });
		expect(() => must(undefined, "thing")).toThrow("Engine invariant broken: missing thing");
		expect(must(0, "zero")).toBe(0);
	});
});
