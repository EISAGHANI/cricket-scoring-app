import { runMigrations } from "./migrate";
import { ensureDatabase, testDatabaseUrl } from "./testing";

export const TEST_DB_NAME = "cricket_test_db";

/** Vitest global setup: create and migrate this package's test database once per run. */
export default async function setup(): Promise<void> {
	const url = testDatabaseUrl(TEST_DB_NAME);
	await ensureDatabase(url);
	await runMigrations(url);
}
