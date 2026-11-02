import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts", "test/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/index.ts"],
			// The brief requires 100% line + branch coverage on the engine.
			thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
		},
	},
});
