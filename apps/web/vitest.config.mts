import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Playwright owns e2e/; Vitest runs unit tests next to the code.
		include: ["lib/**/*.test.ts", "features/**/*.test.ts", "components/**/*.test.ts"],
		env: {
			DATABASE_URL: "postgres://cricket:cricket@localhost:5432/cricket_test",
			BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-00",
		},
	},
});
