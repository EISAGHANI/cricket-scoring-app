import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const VenueInput = z.object({
	name: z.string().trim().min(2, "At least 2 characters").max(120),
	address: optionalText(200),
	city: optionalText(80),
	country: optionalText(80),
	organizationId: z.uuid().optional(),
});
export type VenueInput = z.infer<typeof VenueInput>;
