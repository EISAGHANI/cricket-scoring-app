import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
	test: {
		// Playwright owns e2e/; Vitest runs unit and integration tests next to the code.
		include: ["lib/**/*.test.ts", "features/**/*.test.ts", "components/**/*.test.ts"],
		globalSetup: ["./test/db-setup.ts"],
		// Integration tests share one test database.
		fileParallelism: false,
		testTimeout: 20_000,
		env: {
			DATABASE_URL: "postgres://cricket:cricket@localhost:5432/cricket_test",
			BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-00",
		},
	},
});
