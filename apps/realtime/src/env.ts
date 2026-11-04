import { z } from "zod";

const EnvSchema = z.object({
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	PORT: z.coerce.number().int().positive(),
	REDIS_URL: z.url({ protocol: /^rediss?$/ }),
	/** Shared with the web app; signs the scorer tokens that unlock the lock channel. */
	REALTIME_SECRET: z.string().min(32).optional(),
	/** Allowed browser origins, comma-separated. Unset allows none (same-origin only). */
	CORS_ORIGINS: z
		.string()
		.optional()
		.transform((v) =>
			v
				?.split(",")
				.map((s) => s.trim())
				.filter(Boolean),
		),
});

export type Env = z.infer<typeof EnvSchema>;

/** Validates process.env once at startup and exits with a readable error if anything is missing. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
	const parsed = EnvSchema.safeParse(source);
	if (!parsed.success) {
		console.error("Invalid environment variables:\n" + z.prettifyError(parsed.error));
		process.exit(1);
	}
	return parsed.data;
}
