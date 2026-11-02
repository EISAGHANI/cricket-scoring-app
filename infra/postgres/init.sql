-- Extensions the platform relies on (see docs/DATA_MODEL.md).
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy player/team search
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive emails, slugs

-- Separate database for integration tests so they never touch dev data.
CREATE DATABASE cricket_test OWNER cricket;
\connect cricket_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
