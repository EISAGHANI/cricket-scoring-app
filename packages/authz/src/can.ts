import {
	POLICY,
	type Action,
	type Condition,
	type Grant,
	type Relation,
	type Resource,
	type Subject,
} from "./policy";

export class Forbidden extends Error {
	override readonly name = "Forbidden";
	constructor(readonly action: Action) {
		super(`Not allowed: ${action}`);
	}
}

type Scope = { scopeType: "ORGANIZATION" | "CLUB" | "TEAM"; scopeId: string };

const one = (scopeType: Scope["scopeType"], scopeId: string | null): Scope[] =>
	scopeId === null ? [] : [{ scopeType, scopeId }];

/** Every relation's scopes for this resource (empty when the relation does not apply). */
export function scopesOf(resource: Resource): Record<Relation, Scope[]> {
	const none: Record<Relation, Scope[]> = {
		organization: [],
		club: [],
		team: [],
		playerTeams: [],
		playerClubs: [],
	};
	switch (resource.type) {
		case "organization":
			return { ...none, organization: one("ORGANIZATION", resource.id) };
		case "venue":
			return { ...none, organization: one("ORGANIZATION", resource.organizationId) };
		case "club":
			return { ...none, club: one("CLUB", resource.id) };
		case "team":
			return { ...none, team: one("TEAM", resource.id), club: one("CLUB", resource.clubId) };
		case "player":
			return {
				...none,
				playerTeams: resource.teams.flatMap((t) => one("TEAM", t.teamId)),
				playerClubs: resource.teams.flatMap((t) => one("CLUB", t.clubId)),
			};
		case "user":
			return none;
	}
}

function holds(condition: Condition, resource: Resource): boolean {
	switch (condition) {
		case "standalone":
			return resource.type === "team" && resource.clubId === null;
		case "publicVenue":
			return resource.type === "venue" && resource.organizationId === null;
		case "unclaimed":
			return resource.type === "player" && resource.userId === null;
	}
}

/** The user who owns the resource, if ownership applies to it. */
export function ownerOf(resource: Resource): string | null {
	switch (resource.type) {
		case "player":
			return resource.userId;
		case "user":
			return resource.id;
		case "venue":
			return resource.createdBy;
		case "organization":
		case "club":
		case "team":
			return null;
	}
}

function grantAllows(grant: Grant, subject: Subject, resource: Resource): boolean {
	switch (grant.kind) {
		case "authenticated":
			return grant.when === undefined || holds(grant.when, resource);
		case "owner":
			return ownerOf(resource) === subject.userId;
		case "role": {
			const scopes = scopesOf(resource)[grant.via];
			return subject.roles.some(
				(r) =>
					grant.roles.includes(r.role) &&
					scopes.some((s) => s.scopeType === r.scopeType && s.scopeId === r.scopeId),
			);
		}
	}
}

export function isSuperAdmin(subject: Subject | null): boolean {
	return (
		subject !== null &&
		subject.roles.some((r) => r.role === "SUPER_ADMIN" && r.scopeType === "PLATFORM")
	);
}

/** Pure permission check. Server code must call this (via authorize) before every mutation. */
export function can(subject: Subject | null, action: Action, resource: Resource): boolean {
	const rule = POLICY[action];
	if (resource.type !== rule.resource) return false;
	if (subject === null) return false;
	if (isSuperAdmin(subject)) return true;
	return rule.grants.some((g: Grant) => grantAllows(g, subject, resource));
}

/** Throws Forbidden unless allowed. */
export function authorize(
	subject: Subject | null,
	action: Action,
	resource: Resource,
): asserts subject is Subject {
	if (!can(subject, action, resource)) throw new Forbidden(action);
}
