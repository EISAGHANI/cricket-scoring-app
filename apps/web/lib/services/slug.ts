import { sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Executor } from "@cricket/db";

/** "Royal Challengers (U-19)" → "royal-challengers-u-19" */
export function slugify(input: string): string {
	const slug = input
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");
	return slug === "" ? "item" : slug;
}

/** First free slug among base, base-2, base-3, … (case-insensitive: slugs are citext). */
export async function uniqueSlug(
	tx: Executor,
	table: PgTable,
	column: PgColumn,
	base: string,
): Promise<string> {
	const root = slugify(base);
	const rows = await tx
		.select({ slug: column })
		.from(table)
		.where(sql`${column} = ${root} or ${column} like ${`${root}-%`}`);
	const taken = new Set(rows.map((r) => String(r.slug).toLowerCase()));
	if (!taken.has(root)) return root;
	for (let n = 2; ; n++) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
}
