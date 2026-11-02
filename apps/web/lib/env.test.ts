import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
	it("applies defaults when optional infra vars are absent", () => {
		const env = parseEnv({});
		expect(env.NODE_ENV).toBe("development");
		expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
		expect(env.DATABASE_URL).toBeUndefined();
	});

	it("rejects a malformed DATABASE_URL", () => {
		expect(() => parseEnv({ DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
	});

	it("accepts the docker-compose defaults", () => {
		const env = parseEnv({
			DATABASE_URL: "postgres://cricket:cricket@localhost:5432/cricket",
			REDIS_URL: "redis://localhost:6379",
		});
		expect(env.REDIS_URL).toBe("redis://localhost:6379");
	});
});
