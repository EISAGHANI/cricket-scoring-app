import "server-only";
import { schema } from "@cricket/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, magicLink, phoneNumber } from "better-auth/plugins";
import { db } from "../db";
import { env } from "../env";
import { mailer } from "../mail";
import { sms } from "../sms";

const google =
	env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
		? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
		: {};

/** Passwordless sign-in (brief §2): email code, magic link, phone code, and Google when configured. */
export const auth = betterAuth({
	appName: "Cricket Platform",
	baseURL: env.NEXT_PUBLIC_APP_URL,
	secret: env.BETTER_AUTH_SECRET,
	trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: schema.users,
			session: schema.sessions,
			account: schema.accounts,
			verification: schema.verifications,
			rateLimit: schema.rateLimits,
		},
	}),
	advanced: {
		cookiePrefix: "cricket",
		// Postgres generates UUIDv7 ids (ADR-0011).
		database: { generateId: false },
	},
	emailAndPassword: { enabled: false },
	socialProviders: google,
	account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge: 60 * 60 * 24,
		cookieCache: { enabled: true, maxAge: 5 * 60 },
	},
	rateLimit: {
		enabled: true,
		storage: "database",
		window: 60,
		max: 100,
		customRules: {
			"/email-otp/send-verification-otp": { window: 60, max: env.AUTH_CODE_REQUESTS_PER_MINUTE },
			"/sign-in/magic-link": { window: 60, max: env.AUTH_CODE_REQUESTS_PER_MINUTE },
			"/phone-number/send-otp": { window: 60, max: env.AUTH_CODE_REQUESTS_PER_MINUTE },
			// Code verification: each code also allows only 3 attempts (Better Auth default).
			"/sign-in/email-otp": { window: 60, max: env.AUTH_CODE_REQUESTS_PER_MINUTE * 2 },
			"/phone-number/verify": { window: 60, max: env.AUTH_CODE_REQUESTS_PER_MINUTE * 2 },
		},
	},
	plugins: [
		emailOTP({
			otpLength: 6,
			expiresIn: 10 * 60,
			async sendVerificationOTP({ email, otp }) {
				await mailer.send({
					to: email,
					subject: `${otp} is your sign-in code`,
					text: `Your sign-in code is ${otp}. It expires in 10 minutes.\n\nIf you didn't ask for it, ignore this email.`,
				});
			},
		}),
		magicLink({
			expiresIn: 10 * 60,
			async sendMagicLink({ email, url }) {
				await mailer.send({
					to: email,
					subject: "Your sign-in link",
					text: `Sign in: ${url}\n\nThe link expires in 10 minutes. If you didn't ask for it, ignore this email.`,
				});
			},
		}),
		phoneNumber({
			otpLength: 6,
			async sendOTP({ phoneNumber: to, code }) {
				await sms.send(to, `Your sign-in code is ${code}`);
			},
			signUpOnVerification: {
				// Phone-only accounts get a placeholder address the user can replace later.
				getTempEmail: (phone) => `${phone.replace(/\D/g, "")}@phone.cricket.invalid`,
				getTempName: () => "",
			},
		}),
		// Lets Server Actions set auth cookies; must be last.
		nextCookies(),
	],
});

export type AuthSession = typeof auth.$Infer.Session;
