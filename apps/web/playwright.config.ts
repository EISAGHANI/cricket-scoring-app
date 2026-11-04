import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const REALTIME_PORT = Number(process.env.E2E_REALTIME_PORT ?? 4101);

/** End-to-end tests against the real stack (Postgres, Mailpit, S3 from infra/docker-compose.yml). */
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["github"], ["list"]] : "list",
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "retain-on-failure",
	},
	projects: [
		// 375px: the brief's minimum supported width.
		{ name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 800 } } },
	],
	webServer: [
		{
			command: "pnpm exec tsx src/index.ts",
			cwd: "../realtime",
			url: `http://localhost:${REALTIME_PORT}/healthz`,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			env: { PORT: String(REALTIME_PORT), CORS_ORIGINS: `http://localhost:${PORT}` },
		},
		{
			command: process.env.CI ? `pnpm exec next start -p ${PORT}` : `pnpm exec next dev -p ${PORT}`,
			url: `http://localhost:${PORT}/sign-in`,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
			env: {
				NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
				NEXT_PUBLIC_REALTIME_URL: `http://localhost:${REALTIME_PORT}`,
				AUTH_CODE_REQUESTS_PER_MINUTE: "1000",
			},
		},
	],
});
