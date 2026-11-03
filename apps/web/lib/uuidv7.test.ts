import { describe, expect, it } from "vitest";
import { z } from "zod";
import { uuidv7 } from "./uuidv7";

describe("uuidv7", () => {
	it("is a valid version-7 UUID that sorts by time", () => {
		const a = uuidv7(1_700_000_000_000);
		const b = uuidv7(1_700_000_000_001);
		expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(z.uuid().safeParse(a).success).toBe(true);
		expect(a < b).toBe(true);
		expect(a.slice(0, 13)).toBe("018bcfe5-6800");
	});
});
