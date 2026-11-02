import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
	it("makes URL-safe slugs", () => {
		expect(slugify("Royal Challengers (U-19)")).toBe("royal-challengers-u-19");
		expect(slugify("  Café Côté  ")).toBe("cafe-cote");
		expect(slugify("!!!")).toBe("item");
		expect(slugify("a".repeat(80))).toHaveLength(60);
	});
});
