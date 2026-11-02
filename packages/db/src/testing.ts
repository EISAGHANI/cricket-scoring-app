/**
 * Integration-test helpers. Tests run against TEST_DATABASE_URL (the `cricket_test` database
 * created by infra/postgres/init.sql), never the dev database.
 */
import { sql } from "drizzle-orm";
import { createDb, type Database, type DbHandle } from "./client";

export const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ?? "postgres://cricket:cricket@localhost:5432/cricket_test";

export function createTestDb(): DbHandle {
	if (!/_test\b/.test(TEST_DATABASE_URL)) {
		throw new Error(`Refusing to run tests against a non-test database: ${TEST_DATABASE_URL}`);
	}
	return createDb(TEST_DATABASE_URL, { max: 4 });
}

/** Empty every application table (fast, keeps the schema and migrations). */
export async function resetDatabase(db: Database): Promise<void> {
	const rows = await db.execute<{ tablename: string }>(
		sql`select tablename from pg_tables where schemaname = 'public'`,
	);
	if (rows.length === 0) return;
	const names = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
	await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
}
