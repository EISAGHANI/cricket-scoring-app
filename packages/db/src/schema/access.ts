/** Roles, audit trail and consents (ARCHITECTURE.md §6, brief §6 and §8). */
import { index, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id } from "./columns";

export const roleEnum = pgEnum("role", [
	"SUPER_ADMIN",
	"ORG_ADMIN",
	"TOURNAMENT_ORGANIZER",
	"CLUB_ADMIN",
	"TEAM_MANAGER",
	"CAPTAIN",
	"SCORER",
	"UMPIRE",
	"REFEREE",
	"PLAYER",
]);

export const scopeTypeEnum = pgEnum("scope_type", [
	"PLATFORM",
	"ORGANIZATION",
	"LEAGUE",
	"TOURNAMENT",
	"CLUB",
	"TEAM",
	"MATCH",
]);

/** A user holds `role` within one scope. "Fan" is the absence of any row. */
export const roleAssignments = pgTable(
	"role_assignments",
	{
		id: id(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: roleEnum("role").notNull(),
		scopeType: scopeTypeEnum("scope_type").notNull(),
		/** null only for PLATFORM scope. */
		scopeId: uuid("scope_id"),
		grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
		createdAt: createdAt(),
	},
	(t) => [
		unique("role_assignments_unique")
			.on(t.userId, t.role, t.scopeType, t.scopeId)
			.nullsNotDistinct(),
		index("role_assignments_scope_idx").on(t.scopeType, t.scopeId),
	],
);

/** Append-only record of admin mutations, written in the same transaction as the change. */
export const auditLog = pgTable(
	"audit_log",
	{
		id: id(),
		actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
		action: text("action").notNull(),
		resourceType: text("resource_type").notNull(),
		resourceId: uuid("resource_id"),
		organizationId: uuid("organization_id"),
		before: jsonb("before"),
		after: jsonb("after"),
		ip: text("ip"),
		at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("audit_log_resource_idx").on(t.resourceType, t.resourceId),
		index("audit_log_actor_idx").on(t.actorId),
		index("audit_log_org_idx").on(t.organizationId, t.at),
	],
);

export const consentKindEnum = pgEnum("consent_kind", ["MARKETING_EMAIL", "GUARDIAN"]);

export const consents = pgTable(
	"consents",
	{
		id: id(),
		kind: consentKindEnum("kind").notNull(),
		/** The user consenting for themselves (marketing) or a guardian (GUARDIAN). */
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		/** For GUARDIAN: the minor's player profile. */
		playerId: uuid("player_id"),
		grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
	},
	(t) => [index("consents_user_idx").on(t.userId), index("consents_player_idx").on(t.playerId)],
);
