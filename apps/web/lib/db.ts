import "server-only";
import { createDb, type Database } from "@cricket/db";
import { env } from "./env";

// One pool per server instance; survives dev hot reloads.
const globalForDb = globalThis as unknown as { cricketDb?: Database };

export const db: Database = globalForDb.cricketDb ?? createDb(env.DATABASE_URL).db;
if (env.NODE_ENV !== "production") globalForDb.cricketDb = db;
