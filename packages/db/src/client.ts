import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
/** A database handle or an open transaction: repositories accept either. */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface DbHandle {
	db: Database;
	close: () => Promise<void>;
}

/** One pool per process. `max` stays small for serverless (Fluid Compute reuses instances). */
export function createDb(url: string, options: { max?: number } = {}): DbHandle {
	const client = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
	return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}
