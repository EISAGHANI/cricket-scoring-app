/**
 * Organisations (tenants), clubs, teams, players and the flows that connect them (Phase 2 slice
 * of DATA_MODEL.md). Players, clubs and teams are global; organisations own tenant data (ADR-0014).
 */
import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	check,
	date,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { citext, createdAt, deletedAt, id, updatedAt } from "./columns";

const createdBy = () => uuid("created_by").references(() => users.id, { onDelete: "set null" });

export const mediaOwnerEnum = pgEnum("media_owner", [
	"USER",
	"PLAYER",
	"TEAM",
	"CLUB",
	"ORGANIZATION",
]);
export const mediaKindEnum = pgEnum("media_kind", ["AVATAR", "LOGO"]);
export const mediaStatusEnum = pgEnum("media_status", ["PENDING", "READY", "FAILED"]);

export const mediaAssets = pgTable(
	"media_assets",
	{
		id: id(),
		ownerType: mediaOwnerEnum("owner_type").notNull(),
		ownerId: uuid("owner_id").notNull(),
		kind: mediaKindEnum("kind").notNull(),
		/** Object key of the original upload. */
		key: text("key").notNull().unique(),
		mime: text("mime").notNull(),
		bytes: integer("bytes").notNull(),
		status: mediaStatusEnum("status").notNull().default("PENDING"),
		/** Resized WebP variants: { "256": "key", "64": "key" }. */
		variants: jsonb("variants").$type<Record<string, string>>().notNull().default({}),
		createdBy: createdBy(),
		createdAt: createdAt(),
	},
	(t) => [index("media_assets_owner_idx").on(t.ownerType, t.ownerId)],
);

export const organizations = pgTable("organizations", {
	id: id(),
	/** Subdomain for the league website (Phase 7). */
	slug: citext("slug").notNull().unique(),
	name: text("name").notNull(),
	branding: jsonb("branding").$type<Record<string, unknown>>().notNull().default({}),
	logoAssetId: uuid("logo_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
	createdBy: createdBy(),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
	deletedAt: deletedAt(),
});

export const venues = pgTable(
	"venues",
	{
		id: id(),
		/** null = public venue; otherwise owned by the organisation. */
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "cascade",
		}),
		name: text("name").notNull(),
		address: text("address"),
		city: text("city"),
		country: text("country"),
		latitude: doublePrecision("latitude"),
		longitude: doublePrecision("longitude"),
		createdBy: createdBy(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		index("venues_org_idx").on(t.organizationId),
		index("venues_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
	],
);

export const clubs = pgTable(
	"clubs",
	{
		id: id(),
		slug: citext("slug").notNull().unique(),
		name: text("name").notNull(),
		logoAssetId: uuid("logo_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
		homeVenueId: uuid("home_venue_id").references(() => venues.id, { onDelete: "set null" }),
		createdBy: createdBy(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(t) => [index("clubs_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`)],
);

export const teamCategoryEnum = pgEnum("team_category", [
	"SENIOR",
	"WOMEN",
	"JUNIOR",
	"VETERANS",
	"OTHER",
]);

export const teams = pgTable(
	"teams",
	{
		id: id(),
		/** Teams may exist outside a club (DATA_MODEL.md §3, Q5). */
		clubId: uuid("club_id").references(() => clubs.id, { onDelete: "set null" }),
		slug: citext("slug").notNull().unique(),
		name: text("name").notNull(),
		shortName: text("short_name").notNull(),
		category: teamCategoryEnum("category").notNull().default("SENIOR"),
		logoAssetId: uuid("logo_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
		homeVenueId: uuid("home_venue_id").references(() => venues.id, { onDelete: "set null" }),
		createdBy: createdBy(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(t) => [
		index("teams_club_idx").on(t.clubId),
		index("teams_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
		check("teams_short_name_len", sql`char_length(${t.shortName}) between 1 and 6`),
	],
);

export const battingHandEnum = pgEnum("batting_hand", ["RIGHT", "LEFT"]);
export const playerRoleEnum = pgEnum("player_role", [
	"BATTER",
	"BOWLER",
	"ALL_ROUNDER",
	"WICKET_KEEPER",
]);
export const bowlingStyleEnum = pgEnum("bowling_style", [
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
]);
export const visibilityEnum = pgEnum("visibility", ["PUBLIC", "PRIVATE_TO_TEAM"]);

export const players = pgTable(
	"players",
	{
		id: id(),
		/** Set when a user claims this profile. */
		userId: uuid("user_id")
			.unique()
			.references(() => users.id, { onDelete: "set null" }),
		slug: citext("slug").notNull().unique(),
		displayName: text("display_name").notNull(),
		dateOfBirth: date("date_of_birth", { mode: "string" }),
		battingHand: battingHandEnum("batting_hand"),
		bowlingStyle: bowlingStyleEnum("bowling_style"),
		role: playerRoleEnum("role"),
		visibility: visibilityEnum("visibility").notNull().default("PUBLIC"),
		/** Guardian consent for a minor's public profile (DATA_MODEL.md §3). */
		guardianConsent: boolean("guardian_consent").notNull().default(false),
		photoAssetId: uuid("photo_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
		/** Duplicate-profile merges (Phase 5). */
		mergedIntoId: uuid("merged_into_id").references((): AnyPgColumn => players.id, {
			onDelete: "set null",
		}),
		createdBy: createdBy(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(t) => [index("players_name_trgm_idx").using("gin", sql`${t.displayName} gin_trgm_ops`)],
);

export const squadRoleEnum = pgEnum("squad_role", [
	"CAPTAIN",
	"VICE_CAPTAIN",
	"WICKET_KEEPER",
	"PLAYER",
]);

/** Squad membership over time. One open membership per (team, player). */
export const teamPlayers = pgTable(
	"team_players",
	{
		id: id(),
		teamId: uuid("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		playerId: uuid("player_id")
			.notNull()
			.references(() => players.id, { onDelete: "cascade" }),
		squadRole: squadRoleEnum("squad_role").notNull().default("PLAYER"),
		joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
		leftAt: timestamp("left_at", { withTimezone: true }),
	},
	(t) => [
		uniqueIndex("team_players_open_idx")
			.on(t.teamId, t.playerId)
			.where(sql`${t.leftAt} is null`),
		index("team_players_player_idx").on(t.playerId),
	],
);

export const requestStatusEnum = pgEnum("request_status", [
	"PENDING",
	"APPROVED",
	"REJECTED",
	"CANCELLED",
]);

/** A user asks to be recognised as an existing (unclaimed) player profile. */
export const playerClaims = pgTable(
	"player_claims",
	{
		id: id(),
		playerId: uuid("player_id")
			.notNull()
			.references(() => players.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		message: text("message"),
		status: requestStatusEnum("status").notNull().default("PENDING"),
		decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		createdAt: createdAt(),
	},
	(t) => [
		uniqueIndex("player_claims_pending_idx")
			.on(t.playerId, t.userId)
			.where(sql`${t.status} = 'PENDING'`),
		index("player_claims_user_idx").on(t.userId),
	],
);

export const invitationStatusEnum = pgEnum("invitation_status", ["PENDING", "ACCEPTED", "REVOKED"]);

/** Team invitations by email or phone. Only a hash of the token is stored. */
export const invitations = pgTable(
	"invitations",
	{
		id: id(),
		teamId: uuid("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		email: citext("email"),
		phoneNumber: text("phone_number"),
		/** Invite an existing (unclaimed) player profile to be claimed on acceptance. */
		playerId: uuid("player_id").references(() => players.id, { onDelete: "set null" }),
		squadRole: squadRoleEnum("squad_role").notNull().default("PLAYER"),
		tokenHash: text("token_hash").notNull().unique(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		status: invitationStatusEnum("status").notNull().default("PENDING"),
		invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
		acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
		acceptedAt: timestamp("accepted_at", { withTimezone: true }),
		createdAt: createdAt(),
	},
	(t) => [
		index("invitations_team_idx").on(t.teamId),
		check("invitations_contact", sql`${t.email} is not null or ${t.phoneNumber} is not null`),
	],
);

/** A user asks to join a team's squad. */
export const joinRequests = pgTable(
	"join_requests",
	{
		id: id(),
		teamId: uuid("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		message: text("message"),
		status: requestStatusEnum("status").notNull().default("PENDING"),
		decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		createdAt: createdAt(),
	},
	(t) => [
		uniqueIndex("join_requests_pending_idx")
			.on(t.teamId, t.userId)
			.where(sql`${t.status} = 'PENDING'`),
		index("join_requests_user_idx").on(t.userId),
	],
);
