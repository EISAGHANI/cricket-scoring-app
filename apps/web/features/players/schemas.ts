import { z } from "zod";

export const BATTING_HANDS = ["RIGHT", "LEFT"] as const;
export const PLAYER_ROLES = ["BATTER", "BOWLER", "ALL_ROUNDER", "WICKET_KEEPER"] as const;
export const BOWLING_STYLES = [
	"RIGHT_ARM_FAST",
	"RIGHT_ARM_MEDIUM_FAST",
	"RIGHT_ARM_MEDIUM",
	"RIGHT_ARM_OFF_BREAK",
	"RIGHT_ARM_LEG_BREAK",
	"LEFT_ARM_FAST",
	"LEFT_ARM_MEDIUM_FAST",
	"LEFT_ARM_MEDIUM",
	"LEFT_ARM_ORTHODOX",
	"LEFT_ARM_WRIST_SPIN",
] as const;
export const SQUAD_ROLES = ["CAPTAIN", "VICE_CAPTAIN", "WICKET_KEEPER", "PLAYER"] as const;

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker")
	.refine((d) => !Number.isNaN(Date.parse(d)) && d >= "1900-01-01", "Not a valid date");

export const PlayerInput = z.object({
	displayName: z.string().trim().min(2, "At least 2 characters").max(80, "At most 80 characters"),
	dateOfBirth: isoDate.optional(),
	battingHand: z.enum(BATTING_HANDS).optional(),
	bowlingStyle: z.enum(BOWLING_STYLES).optional(),
	role: z.enum(PLAYER_ROLES).optional(),
	visibility: z.enum(["PUBLIC", "PRIVATE_TO_TEAM"]).default("PUBLIC"),
	/** Checkbox: "on" when ticked. */
	guardianConsent: z
		.union([z.literal("on"), z.boolean()])
		.optional()
		.transform((v) => v === "on" || v === true),
});
export type PlayerInput = z.infer<typeof PlayerInput>;

export const AddSquadPlayerInput = z.union([
	z.object({ playerId: z.uuid(), squadRole: z.enum(SQUAD_ROLES).default("PLAYER") }),
	z.object({
		displayName: z.string().trim().min(2, "At least 2 characters").max(80),
		squadRole: z.enum(SQUAD_ROLES).default("PLAYER"),
	}),
]);

export const SquadRoleInput = z.object({ squadRole: z.enum(SQUAD_ROLES) });
export const ClaimInput = z.object({ message: z.string().trim().max(500).optional() });
