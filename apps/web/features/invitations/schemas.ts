import { z } from "zod";
import { SQUAD_ROLES } from "@/features/players/schemas";

export const INVITATION_TTL_DAYS = 14;

/** E.164-ish: + and 8–15 digits after removing spaces and dashes. */
const phone = z
	.string()
	.transform((v) => v.replace(/[\s-]/g, ""))
	.pipe(
		z.string().regex(/^\+[1-9]\d{7,14}$/, "Use the international format, e.g. +44 7700 900123"),
	);

export const InvitationInput = z
	.object({
		email: z.email("Enter a valid email address").toLowerCase().optional(),
		phoneNumber: phone.optional(),
		squadRole: z.enum(SQUAD_ROLES).default("PLAYER"),
		/** Link the invitation to an existing unclaimed squad profile. */
		playerId: z.uuid().optional(),
	})
	.refine((v) => (v.email === undefined) !== (v.phoneNumber === undefined), {
		message: "Give an email address or a mobile number",
		path: ["email"],
	});

export const JoinRequestInput = z.object({ message: z.string().trim().max(500).optional() });
