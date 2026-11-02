import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const base = {
	DATABASE_URL: "postgres://cricket:cricket@localhost:5432/cricket",
	BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
	it("applies defaults for optional settings", () => {
		const env = parseEnv(base);
		expect(env.NODE_ENV).toBe("development");
		expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
		expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
		expect(env.MAIL_FROM).toContain("no-reply");
	});

	it("requires a database URL and a strong auth secret", () => {
		expect(() => parseEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
		expect(() => parseEnv({ ...base, DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
		expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow(/at least 32/);
	});

	it("treats empty optional strings as unset", () => {
		expect(parseEnv({ ...base, GOOGLE_CLIENT_ID: "" }).GOOGLE_CLIENT_ID).toBeUndefined();
	});
});
