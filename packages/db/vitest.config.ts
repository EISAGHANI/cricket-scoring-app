import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		globalSetup: ["./src/test-setup.ts"],
		// One shared test database: run files one at a time.
		fileParallelism: false,
		testTimeout: 20_000,
		// This package's own test database (see src/testing.ts).
		env: { TEST_DB_NAME: "cricket_test_db" },
	},
});
