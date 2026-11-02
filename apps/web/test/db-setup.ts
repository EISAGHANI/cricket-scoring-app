import { runMigrations } from "@cricket/db/migrate";
import { TEST_DATABASE_URL } from "@cricket/db/testing";

/** Vitest global setup: migrate the test database once per run. */
export default async function setup(): Promise<void> {
	await runMigrations(TEST_DATABASE_URL);
}
