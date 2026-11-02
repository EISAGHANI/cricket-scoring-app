import { z } from "zod";

export const TEAM_CATEGORIES = ["SENIOR", "WOMEN", "JUNIOR", "VETERANS", "OTHER"] as const;

export const TeamInput = z.object({
	name: z.string().trim().min(2, "At least 2 characters").max(80, "At most 80 characters"),
	shortName: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z0-9]{1,6}$/, "1–6 letters or digits"),
	category: z.enum(TEAM_CATEGORIES).default("SENIOR"),
	clubId: z.uuid().optional(),
});
export type TeamInput = z.infer<typeof TeamInput>;
export type TeamUpdate = Omit<TeamInput, "clubId">;
