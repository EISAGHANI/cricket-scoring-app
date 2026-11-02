import { z } from "zod";

/** Subdomains that must never belong to a league (Phase 7 websites). */
export const RESERVED_SLUGS = new Set([
	"www",
	"app",
	"api",
	"admin",
	"auth",
	"static",
	"assets",
	"mail",
	"help",
	"status",
	"local",
]);

export const OrganizationInput = z.object({
	name: z.string().trim().min(2, "At least 2 characters").max(80, "At most 80 characters"),
	slug: z
		.string()
		.trim()
		.toLowerCase()
		.regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "3–40 lowercase letters, digits or hyphens")
		.refine((s) => !RESERVED_SLUGS.has(s), "This address is reserved"),
});
export type OrganizationInput = z.infer<typeof OrganizationInput>;
