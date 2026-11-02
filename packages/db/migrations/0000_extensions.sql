-- Extensions the schema depends on (DATA_MODEL.md). Postgres 18 provides uuidv7() natively.
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
