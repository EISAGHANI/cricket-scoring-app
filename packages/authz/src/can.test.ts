import { describe, expect, it } from "vitest";
import { authorize, can, Forbidden, isSuperAdmin, ownerOf, scopesOf } from "./can";
import {
	POLICY,
	ROLES,
	type Action,
	type Grant,
	type Resource,
	type Role,
	type Subject,
} from "./policy";

const OWNER = "u-owner";
const subject = (roles: Subject["roles"] = [], userId = "u-1"): Subject => ({ userId, roles });

/** A resource of the action's type that satisfies `grant` (ids o1 / c1 / t1). */
function resourceFor(type: Resource["type"], grant: Grant): Resource {
	const condition = grant.kind === "authenticated" ? grant.when : undefined;
	switch (type) {
		case "organization":
			return { type, id: "o1" };
		case "venue":
			return {
				type,
				id: "v1",
				organizationId: condition === "publicVenue" ? null : "o1",
				createdBy: OWNER,
			};
		case "club":
			return { type, id: "c1" };
		case "team":
			return { type, id: "t1", clubId: condition === "standalone" ? null : "c1" };
		case "player":
			return {
				type,
				id: "p1",
				userId: condition === "unclaimed" ? null : OWNER,
				teams: [{ teamId: "t1", clubId: "c1" }],
			};
		case "user":
			return { type, id: OWNER };
	}
}

const SCOPE = {
	organization: { scopeType: "ORGANIZATION", scopeId: "o1" },
	club: { scopeType: "CLUB", scopeId: "c1" },
	team: { scopeType: "TEAM", scopeId: "t1" },
	playerTeams: { scopeType: "TEAM", scopeId: "t1" },
	playerClubs: { scopeType: "CLUB", scopeId: "c1" },
} as const;

describe("policy matrix (generated from POLICY)", () => {
	for (const [action, rule] of Object.entries(POLICY) as [Action, (typeof POLICY)[Action]][]) {
		const grants = rule.grants as readonly Grant[];
		grants.forEach((grant, i) => {
			const resource = resourceFor(rule.resource, grant);
			if (grant.kind === "authenticated") {
				it(`${action} #${i}: any signed-in user${grant.when ? ` when ${grant.when}` : ""}`, () => {
					expect(can(subject(), action, resource)).toBe(true);
					expect(can(null, action, resource)).toBe(false);
				});
			} else if (grant.kind === "owner") {
				it(`${action} #${i}: the owner`, () => {
					expect(can(subject([], OWNER), action, resource)).toBe(true);
				});
			} else {
				for (const role of grant.roles) {
					it(`${action} #${i}: ${role} via ${grant.via}`, () => {
						const scope = SCOPE[grant.via];
						expect(can(subject([{ role, ...scope }]), action, resource)).toBe(true);
						// Same role in another organisation/club/team: denied (tenant isolation).
						expect(
							can(
								subject([{ role, scopeType: scope.scopeType, scopeId: "other" }]),
								action,
								resource,
							),
						).toBe(false);
					});
				}
			}
		});

		const granted = new Set(grants.flatMap((g) => (g.kind === "role" ? g.roles : [])));
		const open = grants.some((g) => g.kind === "authenticated");
		if (!open) {
			it(`${action}: roles outside the policy are denied`, () => {
				const resource = resourceFor(rule.resource, grants[0]!);
				const others = ROLES.filter((r: Role) => r !== "SUPER_ADMIN" && !granted.has(r));
				const everywhere = others.flatMap((role) =>
					Object.values(SCOPE).map((s) => ({ role, scopeType: s.scopeType, scopeId: s.scopeId })),
				);
				expect(can(subject(everywhere, "u-stranger"), action, resource)).toBe(false);
			});
		}
	}
});

describe("can", () => {
	it("a platform super admin may do anything; a scoped one may not", () => {
		const sa = subject([{ role: "SUPER_ADMIN", scopeType: "PLATFORM", scopeId: null }]);
		expect(isSuperAdmin(sa)).toBe(true);
		expect(can(sa, "club.update", { type: "club", id: "c9" })).toBe(true);
		const scoped = subject([{ role: "SUPER_ADMIN", scopeType: "CLUB", scopeId: "c9" }]);
		expect(isSuperAdmin(scoped)).toBe(false);
		expect(isSuperAdmin(null)).toBe(false);
		expect(can(scoped, "club.update", { type: "club", id: "c9" })).toBe(false);
	});

	it("rejects a resource of the wrong type", () => {
		const sa = subject([{ role: "SUPER_ADMIN", scopeType: "PLATFORM", scopeId: null }]);
		expect(can(sa, "club.update", { type: "team", id: "t1", clubId: null })).toBe(false);
	});

	it("conditions: in-club teams, organisation venues and claimed players need more than sign-in", () => {
		expect(can(subject(), "team.create", { type: "team", id: null, clubId: "c1" })).toBe(false);
		expect(
			can(subject(), "venue.create", {
				type: "venue",
				id: null,
				organizationId: "o1",
				createdBy: null,
			}),
		).toBe(false);
		expect(
			can(subject(), "player.claim", { type: "player", id: "p1", userId: "someone", teams: [] }),
		).toBe(false);
	});

	it("ownership is checked per resource type", () => {
		expect(can(subject([], "u-1"), "user.update", { type: "user", id: "u-2" })).toBe(false);
		expect(
			can(subject([], "u-1"), "venue.update", {
				type: "venue",
				id: "v",
				organizationId: null,
				createdBy: "u-2",
			}),
		).toBe(false);
		expect(
			can(subject([], "u-1"), "player.update", {
				type: "player",
				id: "p",
				userId: "u-2",
				teams: [],
			}),
		).toBe(false);
	});

	it("relations only resolve for their own resource types", () => {
		// A team manager role says nothing about clubs or organisations.
		const tm = subject([{ role: "TEAM_MANAGER", scopeType: "TEAM", scopeId: "t1" }]);
		expect(can(tm, "club.update", { type: "club", id: "t1" })).toBe(false);
		// A standalone team has no club for a club admin to inherit from.
		const ca = subject([{ role: "CLUB_ADMIN", scopeType: "CLUB", scopeId: "c1" }]);
		expect(can(ca, "team.update", { type: "team", id: "t1", clubId: null })).toBe(false);
		// Players outside any club: club admins have no say.
		expect(
			can(ca, "player.update", {
				type: "player",
				id: "p",
				userId: null,
				teams: [{ teamId: "t1", clubId: null }],
			}),
		).toBe(false);
		// Org admins of a public venue's... no organisation: denied.
		const oa = subject([{ role: "ORG_ADMIN", scopeType: "ORGANIZATION", scopeId: "o1" }]);
		expect(
			can(oa, "venue.update", { type: "venue", id: "v", organizationId: null, createdBy: null }),
		).toBe(false);
		expect(can(oa, "organization.update", { type: "organization", id: null })).toBe(false);
	});

	it("resolves scopes and owners for every resource type", () => {
		expect(scopesOf({ type: "user", id: "u" })).toEqual({
			organization: [],
			club: [],
			team: [],
			playerTeams: [],
			playerClubs: [],
		});
		expect(ownerOf({ type: "organization", id: "o" })).toBeNull();
		expect(ownerOf({ type: "club", id: "c" })).toBeNull();
		expect(ownerOf({ type: "team", id: "t", clubId: null })).toBeNull();
	});

	it("authorize throws Forbidden with the action", () => {
		expect(() => authorize(null, "club.create", { type: "club", id: null })).toThrow(Forbidden);
		expect(() => authorize(null, "club.create", { type: "club", id: null })).toThrow(
			"Not allowed: club.create",
		);
		expect(() => authorize(subject(), "club.create", { type: "club", id: null })).not.toThrow();
	});
});
