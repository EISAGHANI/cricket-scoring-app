/**
 * Identity tables used by Better Auth (ADR-0004). Property names are Better Auth's field names;
 * SQL columns follow our snake_case convention. IDs come from Postgres (`generateId: false`).
 */
import {
	bigint,
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { citext, createdAt, deletedAt, id, updatedAt } from "./columns";

export const users = pgTable("users", {
	id: id(),
	name: text("name").notNull(),
	email: citext("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	phoneNumber: text("phone_number").unique(),
	phoneNumberVerified: boolean("phone_number_verified").notNull().default(false),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
	deletedAt: deletedAt(),
});

export const sessions = pgTable(
	"sessions",
	{
		id: id(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		token: text("token").notNull().unique(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
	"accounts",
	{
		id: id(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
		scope: text("scope"),
		password: text("password"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
	"verifications",
	{
		id: id(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/** Better Auth's database-backed rate limiter (Redis replaces it in Phase 4). */
export const rateLimits = pgTable("rate_limits", {
	id: id(),
	key: text("key").notNull().unique(),
	count: integer("count").notNull(),
	lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
