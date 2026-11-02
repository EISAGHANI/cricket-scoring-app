/** Apply checked-in migrations: `pnpm --filter @cricket/db db:migrate`. */
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

export async function runMigrations(url: string): Promise<void> {
	const { db, close } = createDb(url, { max: 1 });
	try {
		await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	} finally {
		await close();
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const url = process.env.DATABASE_URL;
	if (url === undefined || url === "") {
		console.error("DATABASE_URL is required");
		process.exit(1);
	}
	await runMigrations(url);
	console.log("Migrations applied");
}
