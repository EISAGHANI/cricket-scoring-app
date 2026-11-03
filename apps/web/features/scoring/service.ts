/**
 * The scoring write path (PHASE_3_PLAN.md §3, ADR-0005). Every event goes through submitEvent:
 * shape check, permission, serialised by a row lock on the match, sequence check, rule check by
 * the engine, then an append to ball_events. Retries of the same event are idempotent.
 */
import { isDeepStrictEqual } from "node:util";
import { authorize } from "@cricket/authz";
import { schema, type Executor } from "@cricket/db";
import { EventSubmissionSchema } from "@cricket/schemas";
import {
	ENGINE_VERSION,
	RuleViolation,
	applyEvent,
	replay,
	replayFrom,
	type MatchEvent,
	type MatchState,
	type PlayEvent,
} from "@cricket/scoring-engine";
import { and, asc, eq, gt } from "drizzle-orm";
import { matchResource, startPayload } from "@/features/matches/service";
import type { ServiceContext } from "@/lib/services/context";
import { notFound, ServiceError } from "@/lib/services/errors";
import { parse } from "@/lib/services/result";
import { summarize } from "./summary";

const { matches, ballEvents, matchStateSnapshots } = schema;

/** A scoring request the client must react to (HTTP 409 / 422). */
export class ScoringError extends Error {
	constructor(
		readonly status: 409 | 422,
		readonly code: string,
		message: string,
		readonly details: { lastSeq?: number; rule?: string; seq?: number | null } = {},
	) {
		super(message);
		this.name = "ScoringError";
	}
}

export interface Accepted {
	/** The match's head after this request. */
	lastSeq: number;
	/** The event was already stored (a retry); nothing changed. */
	duplicate: boolean;
	/** The match's status changed (it started, finished, or an undo reopened it). */
	statusChanged: boolean;
}

type Row = typeof ballEvents.$inferSelect;
const toEvent = (r: Pick<Row, "id" | "seq" | "type" | "payload">): MatchEvent =>
	({ id: r.id, seq: r.seq, type: r.type, payload: r.payload }) as MatchEvent;
const isLogEvent = (e: { type: string }) => e.type === "UNDO" || e.type === "CORRECTION";

async function eventsFrom(tx: Executor, matchId: string, afterSeq: number): Promise<MatchEvent[]> {
	const rows = await tx
		.select({
			id: ballEvents.id,
			seq: ballEvents.seq,
			type: ballEvents.type,
			payload: ballEvents.payload,
		})
		.from(ballEvents)
		.where(and(eq(ballEvents.matchId, matchId), gt(ballEvents.seq, afterSeq)))
		.orderBy(asc(ballEvents.seq));
	return rows.map(toEvent);
}

/**
 * The current state: the latest snapshot plus the tail, or a full replay when the tail rewrites
 * history (UNDO / CORRECTION) or the snapshot came from another engine version.
 */
export async function loadState(tx: Executor, matchId: string): Promise<MatchState> {
	const [snap] = await tx
		.select()
		.from(matchStateSnapshots)
		.where(eq(matchStateSnapshots.matchId, matchId));
	if (snap !== undefined && snap.engineVersion === ENGINE_VERSION) {
		const tail = await eventsFrom(tx, matchId, snap.seq);
		if (!tail.some(isLogEvent)) return replayFrom(snap.state, tail as PlayEvent[]);
	}
	return replay(await eventsFrom(tx, matchId, 0));
}

function rejected(error: unknown): never {
	if (error instanceof RuleViolation)
		throw new ScoringError(422, error.code, error.message, { rule: error.rule, seq: error.seq });
	throw error;
}

const statusOf = (state: MatchState) =>
	state.status === "NOT_STARTED"
		? ("SCHEDULED" as const)
		: state.status === "IN_PROGRESS"
			? ("LIVE" as const)
			: state.result?.kind === "ABANDONED"
				? ("ABANDONED" as const)
				: ("COMPLETED" as const);

export async function submitEvent(
	ctx: ServiceContext,
	matchId: string,
	raw: unknown,
): Promise<Accepted> {
	const submission = parse(EventSubmissionSchema, raw);
	if (submission.matchId !== matchId)
		throw new ServiceError("INVALID", "The event belongs to another match");
	const event = submission.event as MatchEvent;

	return ctx.db.transaction(async (tx) => {
		// Serialise writers per match (Phase 4 adds the scoring lock on top).
		const [m] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
		if (m === undefined) throw notFound("Match");
		authorize(ctx.subject, "match.score", await matchResource(tx, matchId));
		const subject = ctx.subject;

		const [existing] = await tx.select().from(ballEvents).where(eq(ballEvents.id, event.id));
		if (existing !== undefined) {
			const same =
				existing.matchId === matchId &&
				existing.seq === event.seq &&
				existing.type === event.type &&
				isDeepStrictEqual(existing.payload, event.payload);
			if (same) return { lastSeq: m.lastSeq, duplicate: true, statusChanged: false };
			throw new ScoringError(409, "DUPLICATE_ID", "Another event already has this id", {
				lastSeq: m.lastSeq,
			});
		}
		if (m.status === "CANCELLED")
			throw new ScoringError(422, "MATCH_CANCELLED", "This match was cancelled");
		if (event.seq !== m.lastSeq + 1) {
			throw new ScoringError(409, "SEQ_CONFLICT", "The match has moved on; resync and retry", {
				lastSeq: m.lastSeq,
			});
		}
		if (event.type === "MATCH_STARTED") {
			const expected = await startPayload(tx, matchId);
			if (!isDeepStrictEqual(JSON.parse(JSON.stringify(expected)), event.payload)) {
				throw new ScoringError(
					422,
					"SETUP_MISMATCH",
					"The teams or rules differ from the match setup",
				);
			}
		}

		const before = await loadState(tx, matchId);
		let after: MatchState;
		try {
			after = isLogEvent(event)
				? replay([...(await eventsFrom(tx, matchId, 0)), event])
				: applyEvent(before, event as PlayEvent);
		} catch (error) {
			rejected(error);
		}

		await tx.insert(ballEvents).values({
			id: event.id,
			matchId,
			seq: event.seq,
			inningsNo: after.innings.length === 0 ? null : after.innings.length,
			type: event.type,
			payload: event.payload as Record<string, unknown>,
			schemaVersion: submission.schemaVersion,
			engineVersion: ENGINE_VERSION,
			createdBy: subject.userId,
			deviceId: submission.deviceId,
			clientTimestamp: new Date(submission.clientTimestamp),
		});

		const status = statusOf(after);
		await tx
			.update(matches)
			.set({
				lastSeq: event.seq,
				status,
				summary: summarize(after),
				startedAt: m.startedAt ?? (status === "SCHEDULED" ? null : new Date()),
				completedAt:
					status === "COMPLETED" || status === "ABANDONED" ? (m.completedAt ?? new Date()) : null,
			})
			.where(eq(matches.id, matchId));

		// Snapshot at ends of overs and innings, on status changes, and after history rewrites.
		const boundary =
			event.type === "END_OF_OVER" ||
			isLogEvent(event) ||
			after.innings.length !== before.innings.length ||
			after.status !== before.status ||
			after.innings.at(-1)?.status !== before.innings.at(-1)?.status;
		if (boundary) {
			const snapshot = { seq: event.seq, engineVersion: ENGINE_VERSION, state: after };
			await tx
				.insert(matchStateSnapshots)
				.values({ matchId, ...snapshot })
				.onConflictDoUpdate({ target: matchStateSnapshots.matchId, set: snapshot });
		}
		return { lastSeq: event.seq, duplicate: false, statusChanged: status !== m.status };
	});
}

export interface EventPage {
	lastSeq: number;
	events: MatchEvent[];
	/** More events exist after the last one returned. */
	more: boolean;
}

/** Stored events after `afterSeq` (resync and polling). Public: scorecards are public. */
export async function eventsAfter(
	ctx: Pick<ServiceContext, "db">,
	matchId: string,
	afterSeq: number,
	limit = 1000,
): Promise<EventPage> {
	const [m] = await ctx.db
		.select({ lastSeq: matches.lastSeq })
		.from(matches)
		.where(eq(matches.id, matchId));
	if (m === undefined) throw notFound("Match");
	const rows = await ctx.db
		.select({
			id: ballEvents.id,
			seq: ballEvents.seq,
			type: ballEvents.type,
			payload: ballEvents.payload,
		})
		.from(ballEvents)
		.where(and(eq(ballEvents.matchId, matchId), gt(ballEvents.seq, afterSeq)))
		.orderBy(asc(ballEvents.seq))
		.limit(limit + 1);
	return {
		lastSeq: m.lastSeq,
		events: rows.slice(0, limit).map(toEvent),
		more: rows.length > limit,
	};
}
