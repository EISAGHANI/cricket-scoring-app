import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "./tokens";

describe("tokens", () => {
	it("are long, URL-safe, unique, and hash deterministically", () => {
		const a = generateToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(generateToken()).not.toBe(a);
		expect(hashToken(a)).toBe(hashToken(a));
		expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
	});
});
