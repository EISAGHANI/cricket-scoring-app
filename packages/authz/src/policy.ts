/**
 * The permission policy as data (ARCHITECTURE.md §6). Each action lists the grants that allow it;
 * any matching grant allows the action. A SUPER_ADMIN on the platform is allowed everything.
 * Tests are generated from this table, so it is also the documentation.
 */

export const ROLES = [
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
] as const;
export type Role = (typeof ROLES)[number];

export type ScopeType =
	"PLATFORM" | "ORGANIZATION" | "LEAGUE" | "TOURNAMENT" | "CLUB" | "TEAM" | "MATCH";

export interface RoleAssignment {
	role: Role;
	scopeType: ScopeType;
	/** null only for PLATFORM. */
	scopeId: string | null;
}

/** Who is asking. `null` = signed out. */
export interface Subject {
	userId: string;
	roles: RoleAssignment[];
}

/** What is being acted on, with the ownership facts the policy needs. */
export type Resource =
	| { type: "organization"; id: string | null }
	| { type: "venue"; id: string | null; organizationId: string | null; createdBy: string | null }
	| { type: "club"; id: string | null }
	| { type: "team"; id: string | null; clubId: string | null }
	| {
			type: "player";
			id: string | null;
			userId: string | null;
			/** Teams the player is currently in, with their clubs. */
			teams: { teamId: string; clubId: string | null }[];
	  }
	| { type: "user"; id: string };

/** How a grant's scope relates to the resource. */
export type Relation =
	| "organization" // ORGANIZATION scope = the organisation (or the venue's organisation)
	| "club" // CLUB scope = the club (or the team's club)
	| "team" // TEAM scope = the team
	| "playerTeams" // TEAM scope = any of the player's teams
	| "playerClubs"; // CLUB scope = any of the player's teams' clubs

export type Grant =
	| { kind: "role"; roles: readonly Role[]; via: Relation }
	/** Any signed-in user, optionally only when the condition holds. */
	| { kind: "authenticated"; when?: Condition }
	/** The subject owns the resource (their player profile, their user, a venue they created). */
	| { kind: "owner" };

export type Condition = "standalone" | "publicVenue" | "unclaimed";

const role = (roles: readonly Role[], via: Relation): Grant => ({ kind: "role", roles, via });
const TEAM_STAFF = ["TEAM_MANAGER", "CAPTAIN"] as const;

export const POLICY = {
	"organization.create": { resource: "organization", grants: [{ kind: "authenticated" }] },
	"organization.update": {
		resource: "organization",
		grants: [role(["ORG_ADMIN"], "organization")],
	},
	"organization.manageAdmins": {
		resource: "organization",
		grants: [role(["ORG_ADMIN"], "organization")],
	},

	"venue.create": {
		resource: "venue",
		grants: [{ kind: "authenticated", when: "publicVenue" }, role(["ORG_ADMIN"], "organization")],
	},
	"venue.update": {
		resource: "venue",
		grants: [{ kind: "owner" }, role(["ORG_ADMIN"], "organization")],
	},

	"club.create": { resource: "club", grants: [{ kind: "authenticated" }] },
	"club.update": { resource: "club", grants: [role(["CLUB_ADMIN"], "club")] },
	"club.manageAdmins": { resource: "club", grants: [role(["CLUB_ADMIN"], "club")] },

	"team.create": {
		resource: "team",
		grants: [{ kind: "authenticated", when: "standalone" }, role(["CLUB_ADMIN"], "club")],
	},
	"team.update": {
		resource: "team",
		grants: [role(["TEAM_MANAGER"], "team"), role(["CLUB_ADMIN"], "club")],
	},
	"team.manageAdmins": {
		resource: "team",
		grants: [role(["TEAM_MANAGER"], "team"), role(["CLUB_ADMIN"], "club")],
	},
	"team.manageSquad": {
		resource: "team",
		grants: [role(TEAM_STAFF, "team"), role(["CLUB_ADMIN"], "club")],
	},
	"team.invite": {
		resource: "team",
		grants: [role(TEAM_STAFF, "team"), role(["CLUB_ADMIN"], "club")],
	},
	"team.decideJoinRequest": {
		resource: "team",
		grants: [role(TEAM_STAFF, "team"), role(["CLUB_ADMIN"], "club")],
	},
	"team.requestToJoin": { resource: "team", grants: [{ kind: "authenticated" }] },

	"player.create": { resource: "player", grants: [{ kind: "authenticated" }] },
	"player.update": {
		resource: "player",
		grants: [
			{ kind: "owner" },
			role(TEAM_STAFF, "playerTeams"),
			role(["CLUB_ADMIN"], "playerClubs"),
		],
	},
	"player.viewPrivate": {
		resource: "player",
		grants: [
			{ kind: "owner" },
			role([...TEAM_STAFF, "PLAYER"], "playerTeams"),
			role(["CLUB_ADMIN"], "playerClubs"),
		],
	},
	"player.claim": { resource: "player", grants: [{ kind: "authenticated", when: "unclaimed" }] },
	"player.decideClaim": {
		resource: "player",
		grants: [role(["TEAM_MANAGER"], "playerTeams"), role(["CLUB_ADMIN"], "playerClubs")],
	},

	"user.update": { resource: "user", grants: [{ kind: "owner" }] },
} as const satisfies Record<string, { resource: Resource["type"]; grants: readonly Grant[] }>;

export type Action = keyof typeof POLICY;
