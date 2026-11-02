import { describe, expect, it } from "vitest";
import { containsPattern } from "./like";

describe("containsPattern", () => {
	it("escapes LIKE wildcards and the escape character", () => {
		// Input: 50%_off\   →   %50\%\_off\\%
		expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
		expect(containsPattern("tigers")).toBe("%tigers%");
	});
});
