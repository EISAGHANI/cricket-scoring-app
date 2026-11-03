/** Integration tests (real Postgres): match setup and the scoring write path (PHASE_3_PLAN M2). */
import { readFileSync } from "node:fs";
import { Forbidden } from "@cricket/authz";
import { schema } from "@cricket/db";
import { createTestDb, resetDatabase } from "@cricket/db/testing";
import {
	format,
	replay,
	type DeliveryPayload,
	type MatchEvent,
	type MatchState,
} from "@cricket/scoring-engine";
import { convertCricsheet, type CricsheetMatch } from "@cricket/scoring-engine/cricsheet";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
	cancelMatch,
	createGuestPlayer,
	createMatch,
	startPayload,
} from "@/features/matches/service";
import { createTeam } from "@/features/teams/service";
import { as, makeUser } from "@/test/fixtures";
import { eventsAfter, loadState, submitEvent } from "./service";

const { db, close } = createTestDb();
afterAll(close);
beforeEach(() => resetDatabase(db));

const { players, matches, ballEvents, roleAssignments } = schema;

async function makePlayers(names: string[], dob: string | null = null) {
	const rows = await db
		.insert(players)
		.values(
			names.map((n) => ({
				displayName: n,
				slug: `${n}-${crypto.randomUUID()}`.toLowerCase(),
				dateOfBirth: dob,
			})),
		)
		.returning({ id: players.id });
	return rows.map((r) => r.id);
}

/** Two teams (one manager), three a side, one over each. */
async function setup(extra: { scorerIds?: string[] } = {}) {
	const manager = await makeUser(db, "Manager");
	const opponentManager = await makeUser(db, "Opponent");
	const home = await createTeam(await as(db, manager), { name: "Lions", shortName: "LIO" });
	const away = await createTeam(await as(db, opponentManager), {
		name: "Tigers",
		shortName: "TIG",
	});
	const h = await makePlayers(["Ann", "Bea", "Cat"]);
	const a = await makePlayers(["Dan", "Eve", "Fay"]);
	const input = {
		homeTeamId: home.id,
		awayTeamId: away.id,
		preset: "T20" as const,
		oversPerInnings: 1,
		playersPerSide: 3,
		home: { playerIds: h, captainId: h[0]!, keeperId: h[1]! },
		away: { playerIds: a, captainId: a[0]!, keeperId: a[2]! },
		umpire1: "Dickie Bird",
		scorerIds: extra.scorerIds ?? [],
	};
	const match = await createMatch(await as(db, manager), input);
	return { manager, opponentManager, home, away, h, a, input, matchId: match.id };
}

let n = 0;
function submission(matchId: string, event: Omit<MatchEvent, "id"> & { id?: string }) {
	return {
		matchId,
		event: { id: event.id ?? crypto.randomUUID(), ...event },
		deviceId: "test-device",
		clientTimestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, ++n % 60)).toISOString(),
		schemaVersion: 1 as const,
	};
}

const ball = (p: Partial<DeliveryPayload> = {}): DeliveryPayload => ({
	runs: 0,
	boundary: null,
	overthrow: false,
	extra: null,
	dismissal: null,
	penaltyRuns: 0,
	overMiscount: false,
	detail: null,
	...p,
});

/** A scorer client: tracks seq and submits events in order. */
function scorer(matchId: string, userId: string) {
	let seq = 0;
	return {
		get seq() {
			return seq;
		},
		async send(type: MatchEvent["type"], payload: unknown, id?: string) {
			const sub = submission(matchId, {
				seq: seq + 1,
				type,
				payload,
				...(id ? { id } : {}),
			} as never);
			const result = await submitEvent(await as(db, userId), matchId, sub);
			seq = result.lastSeq;
			return { result, sub };
		},
	};
}

async function start(
	s: ReturnType<typeof scorer>,
	matchId: string,
	battingTeamId: string,
	bat: string[],
	bowl: string[],
) {
	await s.send("MATCH_STARTED", await startPayload(db, matchId));
	await s.send("TOSS", { winnerTeamId: battingTeamId, decision: "BAT" });
	await s.send("INNINGS_STARTED", {
		battingTeamId,
		strikerId: bat[0],
		nonStrikerId: bat[1],
		bowlerId: bowl[0],
	});
}

describe("match setup", () => {
	it("creates a match with selections, officials and scorers; the event names come from the setup", async () => {
		const scorerUser = await makeUser(db, "Scorer");
		const { matchId, home, h } = await setup({ scorerIds: [scorerUser] });
		const payload = await startPayload(db, matchId);
		expect(payload.rules.oversPerInnings).toBe(1);
		expect(payload.rules.playersPerSide).toBe(3);
		expect(payload.rules.powerplays).toEqual([]);
		expect(payload.teams[0]).toMatchObject({
			teamId: home.id,
			name: "Lions",
			shortName: "LIO",
			captainId: h[0],
			wicketKeeperId: h[1],
			playingXI: [
				{ id: h[0], name: "Ann" },
				{ id: h[1], name: "Bea" },
				{ id: h[2], name: "Cat" },
			],
		});
		const roles = await db
			.select()
			.from(roleAssignments)
			.where(eq(roleAssignments.userId, scorerUser));
		expect(roles).toMatchObject([{ role: "SCORER", scopeType: "MATCH", scopeId: matchId }]);
		const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
		expect(m).toMatchObject({ status: "SCHEDULED", lastSeq: 0, preset: "T20" });
	});

	it("stores minors under their initials (events are public and permanent)", async () => {
		const { input, manager } = await setup();
		const [kid] = await makePlayers(["Kid Young"], "2015-01-01");
		const match = await createMatch(await as(db, manager), {
			...input,
			home: { ...input.home, substituteIds: [kid!] },
		});
		const payload = await startPayload(db, match.id);
		expect(payload.teams[0].substitutes).toEqual([{ id: kid, name: "K. Young" }]);
	});

	it("validates the selections and teams", async () => {
		const { input, manager } = await setup();
		const ctx = await as(db, manager);
		await expect(
			createMatch(ctx, { ...input, awayTeamId: input.homeTeamId }),
		).rejects.toMatchObject({
			code: "INVALID",
		});
		await expect(
			createMatch(ctx, {
				...input,
				home: { ...input.home, playerIds: input.home.playerIds.slice(0, 2) },
			}),
		).rejects.toMatchObject({ fieldErrors: { "home.playerIds": "Pick exactly 3 players" } });
		await expect(
			createMatch(ctx, {
				...input,
				away: {
					...input.away,
					playerIds: input.home.playerIds,
					captainId: input.home.captainId,
					keeperId: input.home.keeperId,
				},
			}),
		).rejects.toMatchObject({ code: "INVALID" });
		await expect(
			createMatch(ctx, { ...input, home: { ...input.home, captainId: input.away.captainId } }),
		).rejects.toMatchObject({ fieldErrors: { "home.captainId": "The captain must be in the XI" } });
	});

	it("only staff of either side may create; guests can be added by anyone signed in", async () => {
		const { input, opponentManager } = await setup();
		const stranger = await makeUser(db);
		await expect(createMatch(await as(db, stranger), input)).rejects.toBeInstanceOf(Forbidden);
		await expect(createMatch(await as(db, opponentManager), input)).resolves.toMatchObject({});
		const guest = await createGuestPlayer(await as(db, stranger), { displayName: "Gus Guest" });
		expect(guest.displayName).toBe("Gus Guest");
		await expect(
			createGuestPlayer(await as(db, null), { displayName: "Anon" }),
		).rejects.toBeInstanceOf(Forbidden);
	});

	it("only the creator cancels, and only before play", async () => {
		const { matchId, manager, opponentManager, home, h, a } = await setup();
		await expect(cancelMatch(await as(db, opponentManager), matchId)).rejects.toBeInstanceOf(
			Forbidden,
		);
		const s = scorer(matchId, manager);
		await start(s, matchId, home.id, h, a);
		await expect(cancelMatch(await as(db, manager), matchId)).rejects.toMatchObject({
			code: "CONFLICT",
		});
		const other = await setup();
		await cancelMatch(await as(db, other.manager), other.matchId);
		const [m] = await db.select().from(matches).where(eq(matches.id, other.matchId));
		expect(m!.status).toBe("CANCELLED");
		await expect(
			scorer(other.matchId, other.manager).send(
				"MATCH_STARTED",
				await startPayload(db, other.matchId),
			),
		).rejects.toMatchObject({ code: "MATCH_CANCELLED" });
	});
});

describe("submitting events", () => {
	it("accepts a whole match, moving the status from SCHEDULED to LIVE to COMPLETED", async () => {
		const { matchId, manager, home, away, h, a } = await setup();
		const s = scorer(matchId, manager);
		await start(s, matchId, home.id, h, a);
		let [m] = await db.select().from(matches).where(eq(matches.id, matchId));
		expect(m).toMatchObject({ status: "LIVE", lastSeq: 3 });
		expect(m!.startedAt).not.toBeNull();
		// The innings closes on the last legal ball of its final over (no END_OF_OVER needed).
		for (const runs of [1, 0, 4, 0, 0, 1])
			await s.send("DELIVERY", ball(runs === 4 ? { runs: 0, boundary: "FOUR" } : { runs }));
		[m] = await db.select().from(matches).where(eq(matches.id, matchId));
		expect(m!.summary).toEqual({
			innings: [{ teamId: home.id, runs: 6, wickets: 0, overs: "1.0", superOver: false }],
			status: "Innings break",
		});
		await s.send("INNINGS_STARTED", {
			battingTeamId: away.id,
			strikerId: a[0],
			nonStrikerId: a[1],
			bowlerId: h[2],
		});
		await s.send("DELIVERY", ball({ runs: 0, boundary: "SIX" }));
		[m] = await db.select().from(matches).where(eq(matches.id, matchId));
		expect(m!.summary?.status).toBe("Tigers need 1 from 5 balls");
		await s.send("DELIVERY", ball({ runs: 1 }));
		const state = await loadState(db, matchId);
		expect(state.provisionalResult).toMatchObject({ kind: "WIN", winnerTeamId: away.id });
		const { result } = await s.send("MATCH_RESULT", {
			result: state.provisionalResult,
			override: false,
		});
		expect(result.statusChanged).toBe(true);
		[m] = await db.select().from(matches).where(eq(matches.id, matchId));
		expect(m).toMatchObject({ status: "COMPLETED", lastSeq: 13 });
		expect(m!.summary?.status).toBe("Tigers won by 2 wickets (4 balls left)");
		expect(m!.completedAt).not.toBeNull();
	});

	it("MATCH_STARTED must match the setup exactly", async () => {
		const { matchId, manager } = await setup();
		const payload = await startPayload(db, matchId);
		const tampered = { ...payload, rules: { ...payload.rules, oversPerInnings: 50 } };
		await expect(scorer(matchId, manager).send("MATCH_STARTED", tampered)).rejects.toMatchObject({
			status: 422,
			code: "SETUP_MISMATCH",
		});
	});

	it("rejects rule violations with the engine's code and rule, storing nothing", async () => {
		const { matchId, manager, home, h, a } = await setup();
		const s = scorer(matchId, manager);
		await start(s, matchId, home.id, h, a);
		await expect(s.send("BATTER_IN", { batterId: h[2] })).rejects.toMatchObject({
			status: 422,
			code: expect.any(String),
			details: { rule: expect.stringMatching(/^R-/), seq: 4 },
		});
		expect(await db.select().from(ballEvents)).toHaveLength(3);
	});

	it("retries are idempotent; a stale seq gets 409 with the server's head", async () => {
		const { matchId, manager, home, h, a } = await setup();
		const s = scorer(matchId, manager);
		await start(s, matchId, home.id, h, a);
		const { sub } = await s.send("DELIVERY", ball({ runs: 2 }));
		// The same request again (lost response): accepted as a duplicate, nothing stored twice.
		await expect(submitEvent(await as(db, manager), matchId, sub)).resolves.toEqual({
			lastSeq: 4,
			duplicate: true,
			statusChanged: false,
		});
		// Same id, different content: refused.
		const changed = { ...sub, event: { ...sub.event, payload: ball({ runs: 3 }) } };
		await expect(submitEvent(await as(db, manager), matchId, changed)).rejects.toMatchObject({
			status: 409,
			code: "DUPLICATE_ID",
		});
		// A second device that missed seq 4 tries to write seq 4.
		const stale = submission(matchId, {
			seq: 4,
			type: "DELIVERY",
			payload: ball({ runs: 1 }),
		} as never);
		await expect(submitEvent(await as(db, manager), matchId, stale)).rejects.toMatchObject({
			status: 409,
			code: "SEQ_CONFLICT",
			details: { lastSeq: 4 },
		});
		expect(await db.select().from(ballEvents)).toHaveLength(4);
	});

	it("only the creator and assigned scorers may score", async () => {
		const scorerUser = await makeUser(db, "Scorer");
		const { matchId, opponentManager, home, h, a } = await setup({ scorerIds: [scorerUser] });
		await expect(
			scorer(matchId, opponentManager).send("MATCH_STARTED", await startPayload(db, matchId)),
		).rejects.toBeInstanceOf(Forbidden);
		await expect(
			submitEvent(
				await as(db, null),
				matchId,
				submission(matchId, {
					seq: 1,
					type: "MATCH_STARTED",
					payload: await startPayload(db, matchId),
				} as never),
			),
		).rejects.toBeInstanceOf(Forbidden);
		await start(scorer(matchId, scorerUser), matchId, home.id, h, a);
	});

	it("rejects a submission for another match and malformed events", async () => {
		const { matchId, manager } = await setup();
		const sub = submission(crypto.randomUUID(), {
			seq: 1,
			type: "SWAP_STRIKE",
			payload: { reason: "x" },
		} as never);
		await expect(submitEvent(await as(db, manager), matchId, sub)).rejects.toMatchObject({
			code: "INVALID",
		});
		const bad = submission(matchId, { seq: 1, type: "DELIVERY", payload: { runs: -1 } } as never);
		await expect(submitEvent(await as(db, manager), matchId, bad)).rejects.toMatchObject({
			code: "INVALID",
		});
		await expect(
			submitEvent(await as(db, manager), crypto.randomUUID(), { ...bad, matchId: undefined }),
		).rejects.toMatchObject({ code: "INVALID" });
	});

	it("undo and redo across a snapshot replay to the same state as the full log", async () => {
		const { matchId, manager, home, h, a } = await setup();
		const s = scorer(matchId, manager);
		await start(s, matchId, home.id, h, a);
		for (let i = 0; i < 5; i++) await s.send("DELIVERY", ball({ runs: 1 }));
		// The last ball closes the innings, which writes a snapshot; undo then reaches before it.
		const { sub: last } = await s.send("DELIVERY", ball({ runs: 1 }));
		const { sub: undo } = await s.send("UNDO", { targetId: last.event.id });
		let state = await loadState(db, matchId);
		expect(state.innings[0]!.status).toBe("IN_PROGRESS");
		await s.send("UNDO", { targetId: undo.event.id }); // redo
		state = await loadState(db, matchId);
		expect(state.innings[0]!.status).toBe("COMPLETE");
		const page = await eventsAfter({ db }, matchId, 0);
		expect(page).toMatchObject({ lastSeq: 11, more: false });
		expect(state).toEqual(replay(page.events));
		// Paging and polling from a sequence number.
		const tail = await eventsAfter({ db }, matchId, 9, 1);
		expect(tail.events.map((e) => e.seq)).toEqual([10]);
		expect(tail.more).toBe(true);
		await expect(eventsAfter({ db }, crypto.randomUUID(), 0)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});

describe("golden match through the API", () => {
	it("2019 World Cup final persisted event by event reads back the same scorecard", async () => {
		const raw = readFileSync(
			new URL(
				"../../../../packages/scoring-engine/test/golden/cricsheet/1144530.json",
				import.meta.url,
			),
			"utf8",
		);
		const original = convertCricsheet(JSON.parse(raw) as CricsheetMatch, {
			rules: { tieBreaker: "SUPER_OVER_THEN_BOUNDARY_COUNT" },
		});
		const started = original[0];
		if (started?.type !== "MATCH_STARTED") throw new Error("expected MATCH_STARTED");
		const [nz, eng] = started.payload.teams;

		// Recreate the setup in the database and map Cricsheet ids to ours.
		const manager = await makeUser(db, "Manager");
		const ctx = await as(db, manager);
		const ids = new Map<string, string>();
		const teamIds: string[] = [];
		for (const sheet of [nz, eng]) {
			const team = await createTeam(ctx, { name: sheet.name, shortName: sheet.shortName });
			ids.set(sheet.teamId, team.id);
			teamIds.push(team.id);
			const everyone = [...sheet.playingXI, ...sheet.substitutes];
			const rows = await makePlayers(everyone.map((p) => p.name));
			everyone.forEach((p, i) => ids.set(p.id, rows[i]!));
		}
		const [m] = await db
			.insert(matches)
			.values({
				homeTeamId: teamIds[0]!,
				awayTeamId: teamIds[1]!,
				preset: "ODI",
				rules: started.payload.rules,
				createdBy: manager,
			})
			.returning({ id: matches.id });
		const matchId = m!.id;
		for (const [t, sheet] of [nz, eng].entries()) {
			await db.insert(schema.matchPlayers).values([
				...sheet.playingXI.map((p, position) => ({
					matchId,
					teamId: teamIds[t]!,
					playerId: ids.get(p.id)!,
					name: p.name,
					position,
					isCaptain: p.id === sheet.captainId,
					isKeeper: p.id === sheet.wicketKeeperId,
				})),
				...sheet.substitutes.map((p, i) => ({
					matchId,
					teamId: teamIds[t]!,
					playerId: ids.get(p.id)!,
					name: p.name,
					position: 100 + i,
					isSubstitute: true,
				})),
			]);
		}
		for (const e of original) ids.set(e.id, crypto.randomUUID());
		const remap = (value: unknown): unknown =>
			typeof value === "string"
				? (ids.get(value) ?? value)
				: Array.isArray(value)
					? value.map(remap)
					: value !== null && typeof value === "object"
						? Object.fromEntries(
								Object.entries(value).map(([k, v]) => [k, k === "rules" ? v : remap(v)]),
							)
						: value;
		const events = original.map((e) => remap(e) as MatchEvent);

		for (const event of events) {
			const sub = submission(matchId, event);
			await submitEvent(ctx, matchId, sub);
		}

		const stored = await eventsAfter({ db }, matchId, 0, 5000);
		expect(stored.events).toHaveLength(original.length);
		const expected: MatchState = replay(original);
		const fromDb = await loadState(db, matchId);
		expect(format.formatScorecard(fromDb)).toBe(format.formatScorecard(expected));
		expect(fromDb.result).toEqual(remap(expected.result));
		const [row] = await db.select().from(matches).where(eq(matches.id, matchId));
		expect(row!.status).toBe("COMPLETED");
		expect(row!.summary?.status).toBe("England won (boundary count)");
	}, 120_000);
});
