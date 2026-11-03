import { authorize, playerView, type Resource } from "@cricket/authz";
import { schema, type Executor } from "@cricket/db";
import {
	PRESETS,
	RuleViolation,
	validateRules,
	type MatchRules,
	type MatchStartedEvent,
	type TeamSheet,
} from "@cricket/scoring-engine";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { audit } from "@/lib/services/audit";
import type { ServiceContext } from "@/lib/services/context";
import { conflict, notFound, ServiceError } from "@/lib/services/errors";
import { parse } from "@/lib/services/result";
import { uniqueSlug } from "@/lib/services/slug";
import { GuestPlayerInput, MatchInput } from "./schemas";

const { matches, matchPlayers, matchOfficials, players, teams, venues, users, roleAssignments } =
	schema;

const invalid = (field: string, message: string) =>
	new ServiceError("INVALID", message, { [field]: message });

/** The authorization resource for a match (both sides with their clubs). */
export async function matchResource(
	tx: Executor,
	matchId: string,
): Promise<Extract<Resource, { type: "match" }>> {
	const [m] = await tx
		.select({ createdBy: matches.createdBy, home: matches.homeTeamId, away: matches.awayTeamId })
		.from(matches)
		.where(eq(matches.id, matchId));
	if (m === undefined) throw notFound("Match");
	return {
		type: "match",
		id: matchId,
		createdBy: m.createdBy,
		teams: await sides(tx, [m.home, m.away]),
	};
}

async function sides(tx: Executor, teamIds: string[]) {
	const rows = await tx
		.select({ teamId: teams.id, clubId: teams.clubId })
		.from(teams)
		.where(and(inArray(teams.id, teamIds), isNull(teams.deletedAt)));
	return teamIds.map((id) => {
		const row = rows.find((r) => r.teamId === id);
		if (row === undefined) throw notFound("Team");
		return row;
	});
}

/** Preset + overrides → validated MatchRules. */
export function rulesFor(input: {
	preset: MatchInput["preset"];
	oversPerInnings?: number | undefined;
	playersPerSide?: number | undefined;
	bowlerMaxOvers?: number | null | undefined;
}): MatchRules {
	const base = PRESETS[input.preset];
	const rules: MatchRules = { ...base, powerplays: [...base.powerplays] };
	if (input.playersPerSide !== undefined) rules.playersPerSide = input.playersPerSide;
	if (input.oversPerInnings !== undefined && rules.inningsPerSide === 1) {
		rules.oversPerInnings = input.oversPerInnings;
		// Powerplays from the preset no longer fit a different length.
		if (input.oversPerInnings !== base.oversPerInnings) rules.powerplays = [];
		if (rules.minOversForResult !== null)
			rules.minOversForResult = Math.min(rules.minOversForResult, input.oversPerInnings);
	}
	if (input.bowlerMaxOvers !== undefined) rules.bowlerMaxOvers = input.bowlerMaxOvers;
	if (rules.superOverWickets > rules.playersPerSide - 1)
		rules.superOverWickets = Math.max(1, rules.playersPerSide - 1);
	try {
		validateRules(rules);
	} catch (error) {
		if (error instanceof RuleViolation) throw invalid("preset", error.message);
		throw error;
	}
	return rules;
}

/** Create a scheduled match with both selections, officials and scorers. */
export async function createMatch(ctx: ServiceContext, raw: unknown) {
	const input = parse(MatchInput, raw);
	if (input.homeTeamId === input.awayTeamId)
		throw invalid("awayTeamId", "Pick two different teams");
	const rules = rulesFor(input);
	for (const [key, side] of [
		["home", input.home],
		["away", input.away],
	] as const) {
		if (side.playerIds.length !== rules.playersPerSide)
			throw invalid(`${key}.playerIds`, `Pick exactly ${rules.playersPerSide} players`);
	}
	const homeIds = [...input.home.playerIds, ...input.home.substituteIds];
	const awayIds = [...input.away.playerIds, ...input.away.substituteIds];
	if (homeIds.some((id) => awayIds.includes(id)))
		throw invalid("away.playerIds", "A player can't play for both sides");

	return ctx.db.transaction(async (tx) => {
		const teamRows = await tx
			.select({ id: teams.id, clubId: teams.clubId, name: teams.name })
			.from(teams)
			.where(and(inArray(teams.id, [input.homeTeamId, input.awayTeamId]), isNull(teams.deletedAt)));
		const home = teamRows.find((t) => t.id === input.homeTeamId);
		const away = teamRows.find((t) => t.id === input.awayTeamId);
		if (home === undefined || away === undefined) throw notFound("Team");
		authorize(ctx.subject, "match.create", {
			type: "match",
			id: null,
			createdBy: null,
			teams: [
				{ teamId: home.id, clubId: home.clubId },
				{ teamId: away.id, clubId: away.clubId },
			],
		});
		const subject = ctx.subject;

		if (input.venueId !== undefined) {
			const [v] = await tx
				.select({ id: venues.id })
				.from(venues)
				.where(eq(venues.id, input.venueId));
			if (v === undefined) throw notFound("Venue");
		}
		const people = await tx
			.select({
				id: players.id,
				displayName: players.displayName,
				dateOfBirth: players.dateOfBirth,
				visibility: players.visibility,
				guardianConsent: players.guardianConsent,
			})
			.from(players)
			.where(and(inArray(players.id, [...homeIds, ...awayIds]), isNull(players.deletedAt)));
		if (people.length !== homeIds.length + awayIds.length) throw notFound("Player");
		const today = new Date().toISOString().slice(0, 10);
		// Events are permanent and public: they carry the public-safe name (minors as initials).
		const nameOf = (id: string) => {
			const p = people.find((x) => x.id === id);
			if (p === undefined) throw notFound("Player");
			return playerView({ ...p, photoUrl: null }, false, today).displayName;
		};

		const scorerIds = [...new Set(input.scorerIds)].filter((id) => id !== subject.userId);
		if (scorerIds.length > 0) {
			const found = await tx
				.select({ id: users.id })
				.from(users)
				.where(inArray(users.id, scorerIds));
			if (found.length !== scorerIds.length) throw notFound("Scorer");
		}

		const [m] = await tx
			.insert(matches)
			.values({
				homeTeamId: home.id,
				awayTeamId: away.id,
				venueId: input.venueId ?? null,
				scheduledAt: input.scheduledAt === undefined ? null : new Date(input.scheduledAt),
				preset: input.preset,
				rules,
				createdBy: subject.userId,
			})
			.returning({ id: matches.id });
		const matchId = m!.id;

		const rows = (teamId: string, side: (typeof input)["home"]) => [
			...side.playerIds.map((playerId, position) => ({
				matchId,
				teamId,
				playerId,
				name: nameOf(playerId),
				position,
				isSubstitute: false,
				isCaptain: playerId === side.captainId,
				isKeeper: playerId === side.keeperId,
			})),
			...side.substituteIds.map((playerId, i) => ({
				matchId,
				teamId,
				playerId,
				name: nameOf(playerId),
				position: side.playerIds.length + i,
				isSubstitute: true,
				isCaptain: false,
				isKeeper: false,
			})),
		];
		await tx
			.insert(matchPlayers)
			.values([...rows(home.id, input.home), ...rows(away.id, input.away)]);

		const officials = (
			[
				["UMPIRE_1", input.umpire1],
				["UMPIRE_2", input.umpire2],
				["REFEREE", input.referee],
			] as const
		).flatMap(([role, name]) => (name === undefined ? [] : [{ matchId, role, name }]));
		if (officials.length > 0) await tx.insert(matchOfficials).values(officials);

		if (scorerIds.length > 0) {
			await tx.insert(roleAssignments).values(
				scorerIds.map((userId) => ({
					userId,
					role: "SCORER" as const,
					scopeType: "MATCH" as const,
					scopeId: matchId,
					grantedBy: subject.userId,
				})),
			);
		}
		await audit(tx, {
			actorId: subject.userId,
			action: "match.create",
			resourceType: "match",
			resourceId: matchId,
			after: { ...input, rules },
			ip: ctx.ip ?? null,
		});
		return { id: matchId, teamIds: [home.id, away.id] as [string, string] };
	});
}

/** A player outside both squads (a friend filling in). Not added to any squad. */
export async function createGuestPlayer(ctx: ServiceContext, raw: unknown) {
	const input = parse(GuestPlayerInput, raw);
	authorize(ctx.subject, "player.create", { type: "player", id: null, userId: null, teams: [] });
	const subject = ctx.subject;
	return ctx.db.transaction(async (tx) => {
		const slug = await uniqueSlug(tx, players, players.slug, input.displayName);
		const [p] = await tx
			.insert(players)
			.values({ displayName: input.displayName, slug, createdBy: subject.userId })
			.returning({ id: players.id });
		await audit(tx, {
			actorId: subject.userId,
			action: "player.create.guest",
			resourceType: "player",
			resourceId: p!.id,
			after: input,
			ip: ctx.ip ?? null,
		});
		return { id: p!.id, displayName: input.displayName };
	});
}

/** Cancel a match that has not started. Started matches end through scoring (abandoned, …). */
export async function cancelMatch(ctx: ServiceContext, matchId: string) {
	return ctx.db.transaction(async (tx) => {
		authorize(ctx.subject, "match.manage", await matchResource(tx, matchId));
		const [m] = await tx
			.select({ status: matches.status, lastSeq: matches.lastSeq })
			.from(matches)
			.where(eq(matches.id, matchId))
			.for("update");
		if (m!.status !== "SCHEDULED" || m!.lastSeq > 0)
			throw conflict("Only a match that hasn't started can be cancelled");
		await tx.update(matches).set({ status: "CANCELLED" }).where(eq(matches.id, matchId));
		await audit(tx, {
			actorId: ctx.subject.userId,
			action: "match.cancel",
			resourceType: "match",
			resourceId: matchId,
			ip: ctx.ip ?? null,
		});
		return { id: matchId };
	});
}

/** The MATCH_STARTED payload the setup implies. The event API accepts only this payload. */
export async function startPayload(
	tx: Executor,
	matchId: string,
): Promise<MatchStartedEvent["payload"]> {
	const [m] = await tx
		.select({ rules: matches.rules, home: matches.homeTeamId, away: matches.awayTeamId })
		.from(matches)
		.where(eq(matches.id, matchId));
	if (m === undefined) throw notFound("Match");
	const teamRows = await tx
		.select({ id: teams.id, name: teams.name, shortName: teams.shortName })
		.from(teams)
		.where(inArray(teams.id, [m.home, m.away]));
	const selection = await tx
		.select()
		.from(matchPlayers)
		.where(eq(matchPlayers.matchId, matchId))
		.orderBy(asc(matchPlayers.position));
	const sheet = (teamId: string): TeamSheet => {
		const t = teamRows.find((r) => r.id === teamId);
		if (t === undefined) throw notFound("Team");
		const mine = selection.filter((p) => p.teamId === teamId);
		const ref = (p: (typeof mine)[number]) => ({ id: p.playerId, name: p.name });
		const xi = mine.filter((p) => !p.isSubstitute);
		const captain = xi.find((p) => p.isCaptain) ?? xi[0];
		const keeper = xi.find((p) => p.isKeeper) ?? xi[0];
		if (captain === undefined || keeper === undefined) throw notFound("Playing XI");
		return {
			teamId,
			name: t.name,
			shortName: t.shortName,
			playingXI: xi.map(ref),
			substitutes: mine.filter((p) => p.isSubstitute).map(ref),
			captainId: captain.playerId,
			wicketKeeperId: keeper.playerId,
		};
	};
	return { rules: m.rules, teams: [sheet(m.home), sheet(m.away)] };
}
