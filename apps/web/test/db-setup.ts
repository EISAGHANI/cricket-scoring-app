import { runMigrations } from "@cricket/db/migrate";
import { ensureDatabase, testDatabaseUrl } from "@cricket/db/testing";

/** Vitest global setup: create and migrate the web app's own test database once per run. */
export default async function setup(): Promise<void> {
	const url = testDatabaseUrl("cricket_test_web");
	await ensureDatabase(url);
	await runMigrations(url);
}
