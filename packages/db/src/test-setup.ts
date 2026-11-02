import { runMigrations } from "./migrate";
import { TEST_DATABASE_URL } from "./testing";

/** Vitest global setup: bring the test database up to date once per run. */
export default async function setup(): Promise<void> {
	await runMigrations(TEST_DATABASE_URL);
}
