import type { MatchEvent } from "@cricket/scoring-engine";
import { describe, expect, it } from "vitest";
import { appendContiguous, classifyPush } from "./feed";

const ev = (seq: number) => ({ id: `e${seq}`, seq, type: "DELIVERY", payload: {} }) as MatchEvent;

describe("live feed", () => {
	it("applies the next seq, ignores old ones, resyncs on a gap", () => {
		expect(classifyPush(4, 5)).toBe("apply");
		expect(classifyPush(4, 4)).toBe("ignore");
		expect(classifyPush(4, 2)).toBe("ignore");
		expect(classifyPush(4, 7)).toBe("resync");
	});

	it("appends only contiguous events and keeps the log identity when nothing applies", () => {
		const log = [ev(1), ev(2)];
		const grown = appendContiguous(log, 2, [ev(2), ev(3), ev(4), ev(6)]);
		expect(grown.log.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
		expect(grown.head).toBe(4);
		expect(appendContiguous(log, 2, [ev(5)]).log).toBe(log);
	});
});
