/**
 * Integration-test helpers. Each package tests against its own database (created on demand) so
 * parallel test runs never reset each other's data. The server comes from TEST_DATABASE_URL
 * (default: the docker-compose Postgres); the database name comes from TEST_DB_NAME.
 */
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { createDb, type Database, type DbHandle } from "./client";

const BASE =
	process.env.TEST_DATABASE_URL ?? "postgres://cricket:cricket@localhost:5432/cricket_test";

/** The URL of a test database on the test server. Only names ending in _test or _test_* are allowed. */
export function testDatabaseUrl(name = process.env.TEST_DB_NAME ?? "cricket_test"): string {
	if (!/_test(_[a-z0-9]+)?$/.test(name))
		throw new Error(`Refusing to use a non-test database: ${name}`);
	const url = new URL(BASE);
	url.pathname = `/${name}`;
	return url.toString();
}

/** @deprecated kept for scripts; prefer testDatabaseUrl(name). */
export const TEST_DATABASE_URL = testDatabaseUrl();

/** Create the database if it does not exist (connects to the server's `postgres` database). */
export async function ensureDatabase(url: string): Promise<void> {
	const target = new URL(url);
	const name = decodeURIComponent(target.pathname.slice(1));
	const admin = new URL(url);
	admin.pathname = "/postgres";
	const client = postgres(admin.toString(), { max: 1, onnotice: () => {} });
	try {
		const rows = await client`select 1 from pg_database where datname = ${name}`;
		if (rows.length === 0) await client.unsafe(`create database "${name.replace(/"/g, '""')}"`);
	} finally {
		await client.end({ timeout: 5 });
	}
}

export function createTestDb(name?: string): DbHandle {
	return createDb(testDatabaseUrl(name), { max: 4 });
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
