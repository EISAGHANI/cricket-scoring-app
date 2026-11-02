import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
	it("allows same-site paths and rejects everything else", () => {
		expect(safeNext("/teams/tigers?tab=squad")).toBe("/teams/tigers?tab=squad");
		for (const bad of [
			null,
			undefined,
			"",
			"https://evil.example",
			"//evil.example",
			"/\\evil.example",
			"javascript:alert(1)",
		]) {
			expect(safeNext(bad)).toBe("/me");
		}
		expect(safeNext(null, "/")).toBe("/");
	});
});
