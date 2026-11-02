import type { MatchEvent, MatchResult, MatchRules } from "@cricket/scoring-engine";
import { PRESETS } from "@cricket/scoring-engine";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { MatchResultSchema } from "./events";
import { EventSubmissionSchema, MatchEventSchema, MatchRulesSchema } from "./events";

const delivery = {
	id: "0190b3c2-7f3e-7000-8000-000000000001",
	seq: 7,
	type: "DELIVERY",
	payload: {
		runs: 4,
		boundary: "FOUR",
		overthrow: false,
		extra: null,
		dismissal: null,
		penaltyRuns: 0,
		overMiscount: false,
		detail: { wagon: { x: 0.2, y: 0.9 }, pitch: null, shot: "cover drive", deliveryType: null },
	},
};

describe("event schemas", () => {
	it("match the engine's types exactly (ADR-0006)", () => {
		expectTypeOf<z.infer<typeof MatchEventSchema>>().toEqualTypeOf<MatchEvent>();
		expectTypeOf<z.infer<typeof MatchRulesSchema>>().toEqualTypeOf<MatchRules>();
		expectTypeOf<z.infer<typeof MatchResultSchema>>().toEqualTypeOf<MatchResult>();
	});

	it("accept every preset", () => {
		for (const rules of Object.values(PRESETS)) {
			expect(MatchRulesSchema.safeParse(rules).success).toBe(true);
		}
	});

	it("validate deliveries and reject unknown or malformed fields", () => {
		expect(MatchEventSchema.safeParse(delivery).success).toBe(true);
		const negative = { ...delivery, payload: { ...delivery.payload, runs: -1 } };
		expect(MatchEventSchema.safeParse(negative).success).toBe(false);
		const extraField = { ...delivery, payload: { ...delivery.payload, sneaky: 1 } };
		expect(MatchEventSchema.safeParse(extraField).success).toBe(false);
		expect(MatchEventSchema.safeParse({ ...delivery, type: "TELEPORT" }).success).toBe(false);
	});

	it("validate submissions", () => {
		const submission = {
			matchId: "0190b3c2-7f3e-7000-8000-000000000000",
			event: { id: "e1", seq: 1, type: "UNDO", payload: { targetId: "e0" } },
			deviceId: "pixel-7",
			clientTimestamp: "2026-11-02T12:00:00Z",
			schemaVersion: 1,
		};
		expect(EventSubmissionSchema.safeParse(submission).success).toBe(true);
		expect(EventSubmissionSchema.safeParse({ ...submission, schemaVersion: 2 }).success).toBe(
			false,
		);
	});
});
