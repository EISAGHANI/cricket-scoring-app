import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema/index.ts",
	out: "./migrations",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "postgres://cricket:cricket@localhost:5432/cricket",
	},
	strict: true,
	verbose: true,
});
