/**
 * Zod schemas for the scoring event wire format. They mirror @cricket/scoring-engine's event
 * types exactly (enforced by events.test.ts): Zod checks shape at trust boundaries, the engine
 * checks cricket rules (ADR-0006).
 */
import { z } from "zod";

const id = z.string().min(1).max(64);
const count = z.int().min(0).max(1000);

export const PowerplaySchema = z.strictObject({
	name: z.string().min(1).max(40),
	fromOver: z.int().min(1),
	toOver: z.int().min(1),
});

export const MatchRulesSchema = z.strictObject({
	format: z.string().min(1).max(40),
	playersPerSide: z.int(),
	ballsPerOver: z.int(),
	oversPerInnings: z.int().nullable(),
	inningsPerSide: z.union([z.literal(1), z.literal(2)]),
	maxDays: z.int().min(1).nullable(),
	bowlerMaxOvers: z.int().nullable(),
	bowlerMaxBalls: z.int().nullable(),
	maxConsecutiveOvers: z.int(),
	oversPerEnd: z.int(),
	wideRuns: z.int(),
	noBallRuns: z.int(),
	freeHit: z.enum(["NONE", "ALL_NO_BALLS"]),
	noBallByesScoredAs: z.enum(["BYES", "NO_BALLS"]),
	lastManStands: z.boolean(),
	allowHandledTheBall: z.boolean(),
	boundaryFour: z.int().min(0),
	boundarySix: z.int().min(0),
	tieBreaker: z.enum([
		"NONE",
		"SUPER_OVER",
		"SUPER_OVER_REPEAT",
		"SUPER_OVER_THEN_BOUNDARY_COUNT",
		"BOWL_OUT",
	]),
	superOverBalls: z.int(),
	superOverWickets: z.int(),
	followOnEnabled: z.boolean(),
	followOnMargin: z.int().min(0).nullable(),
	concussionReplacements: z.boolean(),
	impactPlayersPerTeam: z.int().min(0),
	retiredHurtMayReturn: z.boolean(),
	powerplays: z.array(PowerplaySchema).max(10),
	minOversForResult: z.int().min(0).nullable(),
	targetRevision: z.enum(["ARR", "MPO", "DLS_STANDARD", "MANUAL"]),
	dlsG50: z.number().min(0).nullable(),
});

export const PlayerRefSchema = z.strictObject({ id, name: z.string().min(1).max(100) });

export const TeamSheetSchema = z.strictObject({
	teamId: id,
	name: z.string().min(1).max(100),
	shortName: z.string().min(1).max(10),
	playingXI: z.array(PlayerRefSchema).max(15),
	substitutes: z.array(PlayerRefSchema).max(15),
	captainId: id,
	wicketKeeperId: id,
});

const MarginSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("RUNS"), runs: count }),
	z.strictObject({ type: z.literal("WICKETS"), wickets: count, ballsRemaining: count.nullable() }),
	z.strictObject({ type: z.literal("INNINGS"), runs: count }),
	z.strictObject({ type: z.literal("NONE") }),
]);

export const MatchResultSchema = z.discriminatedUnion("kind", [
	z.strictObject({
		kind: z.literal("WIN"),
		winnerTeamId: id,
		margin: MarginSchema,
		method: z.enum([
			"NORMAL",
			"TARGET_REVISION",
			"SUPER_OVER",
			"BOUNDARY_COUNT",
			"BOWL_OUT",
			"AWARDED",
			"FORFEIT",
			"CONCEDED",
		]),
	}),
	z.strictObject({ kind: z.literal("TIE") }),
	z.strictObject({ kind: z.literal("DRAW") }),
	z.strictObject({ kind: z.literal("NO_RESULT") }),
	z.strictObject({ kind: z.literal("ABANDONED") }),
]);

const PointSchema = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

export const DeliveryPayloadSchema = z.strictObject({
	runs: count,
	boundary: z.enum(["FOUR", "SIX"]).nullable(),
	overthrow: z.boolean(),
	extra: z
		.discriminatedUnion("kind", [
			z.strictObject({ kind: z.literal("WIDE") }),
			z.strictObject({ kind: z.literal("NO_BALL"), runsFrom: z.enum(["BAT", "BYE", "LEG_BYE"]) }),
			z.strictObject({ kind: z.literal("BYE") }),
			z.strictObject({ kind: z.literal("LEG_BYE") }),
		])
		.nullable(),
	dismissal: z
		.strictObject({
			kind: z.enum([
				"BOWLED",
				"CAUGHT",
				"LBW",
				"RUN_OUT",
				"STUMPED",
				"HIT_WICKET",
				"OBSTRUCTING_THE_FIELD",
				"HIT_BALL_TWICE",
				"HANDLED_THE_BALL",
			]),
			batterId: id,
			fielderIds: z.array(id).max(5),
			end: z.enum(["STRIKER", "NON_STRIKER"]).nullable(),
			directHit: z.boolean(),
		})
		.nullable(),
	penaltyRuns: count,
	overMiscount: z.boolean(),
	detail: z
		.strictObject({
			wagon: PointSchema.nullable(),
			pitch: PointSchema.nullable(),
			shot: z.string().max(40).nullable(),
			deliveryType: z.string().max(40).nullable(),
		})
		.nullable(),
});

function event<T extends string, P extends z.ZodType>(type: T, payload: P) {
	return z.strictObject({ id, seq: z.int().min(1), type: z.literal(type), payload });
}

export const MatchEventSchema = z.discriminatedUnion("type", [
	event(
		"MATCH_STARTED",
		z.strictObject({
			rules: MatchRulesSchema,
			teams: z.tuple([TeamSheetSchema, TeamSheetSchema]),
		}),
	),
	event("TOSS", z.strictObject({ winnerTeamId: id, decision: z.enum(["BAT", "BOWL"]) })),
	event(
		"INNINGS_STARTED",
		z.strictObject({ battingTeamId: id, strikerId: id, nonStrikerId: id, bowlerId: id }),
	),
	event("DELIVERY", DeliveryPayloadSchema),
	event(
		"WICKET",
		z.strictObject({
			kind: z.enum(["TIMED_OUT", "RUN_OUT", "OBSTRUCTING_THE_FIELD", "HANDLED_THE_BALL"]),
			batterId: id,
			fielderIds: z.array(id).max(5),
		}),
	),
	event("BATTER_IN", z.strictObject({ batterId: id })),
	event(
		"BOWLER_CHANGE",
		z.strictObject({ bowlerId: id, reason: z.enum(["NEW_OVER", "INJURY", "SUSPENDED", "OTHER"]) }),
	),
	event("END_OF_OVER", z.strictObject({ reason: z.enum(["NORMAL", "MISCOUNT"]) })),
	event("PENALTY_RUNS", z.strictObject({ toTeamId: id, runs: count, reason: z.string().max(200) })),
	event("RETIREMENT", z.strictObject({ batterId: id, kind: z.enum(["HURT", "OUT"]) })),
	event(
		"SUBSTITUTION",
		z.strictObject({
			kind: z.enum(["CONCUSSION", "IMPACT", "FIELDING"]),
			teamId: id,
			outPlayerId: id,
			inPlayerId: id,
		}),
	),
	event("SWAP_STRIKE", z.strictObject({ reason: z.string().max(200) })),
	event("DECLARATION", z.strictObject({ teamId: id })),
	event("FOLLOW_ON", z.strictObject({ enforced: z.boolean() })),
	event(
		"INTERRUPTION",
		z.strictObject({ kind: z.enum(["RAIN", "BAD_LIGHT", "LUNCH", "TEA", "STUMPS", "OTHER"]) }),
	),
	event(
		"PLAY_RESUMED",
		z.strictObject({ revisedOvers: z.int().nullable(), revisedBowlerMaxOvers: z.int().nullable() }),
	),
	event(
		"TARGET_REVISED",
		z.strictObject({ target: z.int(), overs: z.int(), override: z.boolean() }),
	),
	event("INNINGS_ENDED", z.strictObject({ reason: z.enum(["ALL_OUT", "FORFEITED"]) })),
	event("SUPER_OVER_STARTED", z.strictObject({ round: z.int().min(1) })),
	event("BOWL_OUT_RESULT", z.strictObject({ winnerTeamId: id })),
	event("MATCH_RESULT", z.strictObject({ result: MatchResultSchema, override: z.boolean() })),
	event("UNDO", z.strictObject({ targetId: id })),
	event("CORRECTION", z.strictObject({ targetId: id, patch: z.record(z.string(), z.unknown()) })),
]);

/** What a client submits: the event plus device metadata. The server adds createdBy and timestamps. */
export const EventSubmissionSchema = z.strictObject({
	matchId: z.uuid(),
	event: MatchEventSchema,
	deviceId: z.string().min(1).max(100),
	clientTimestamp: z.iso.datetime(),
	schemaVersion: z.literal(1),
});

export type EventSubmission = z.infer<typeof EventSubmissionSchema>;
