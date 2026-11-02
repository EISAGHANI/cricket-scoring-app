import { z } from "zod";

/**
 * Validated environment for apps/web. Imported by next.config.ts, so `next dev` / `next build`
 * fail fast with a readable message when a variable is missing or malformed.
 *
 * Only server code reads these values. Client code may only use NEXT_PUBLIC_* values, referenced
 * literally as `process.env.NEXT_PUBLIC_X` so Next.js can inline them.
 */
const optionalString = z
	.string()
	.trim()
	.transform((v) => (v === "" ? undefined : v))
	.optional();

const EnvSchema = z.object({
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),

	DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
	/** Signs sessions and tokens. Generate with `openssl rand -base64 32`. */
	BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),

	/** Google sign-in is enabled only when both are set (Phase 2, Q3). */
	GOOGLE_CLIENT_ID: optionalString,
	GOOGLE_CLIENT_SECRET: optionalString,

	/** Email: Resend when the key is set, else SMTP (Mailpit in dev), else console (Q2). */
	MAIL_FROM: z.string().default("Cricket Platform <no-reply@cricket.local>"),
	RESEND_API_KEY: optionalString,
	SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),

	/** Sign-in code/link requests per IP per minute; verifications get twice this (raised in E2E). */
	AUTH_CODE_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(5),

	REDIS_URL: z.url({ protocol: /^rediss?$/ }).optional(),

	S3_ENDPOINT: z.url().optional(),
	S3_PUBLIC_URL: z.url().optional(),
	S3_REGION: z.string().min(1).default("us-east-1"),
	S3_BUCKET: z.string().min(1).optional(),
	S3_ACCESS_KEY_ID: z.string().min(1).optional(),
	S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
	const parsed = EnvSchema.safeParse(source);
	if (!parsed.success) {
		throw new Error("Invalid environment variables:\n" + z.prettifyError(parsed.error));
	}
	return parsed.data;
}

export const env = parseEnv(process.env);
