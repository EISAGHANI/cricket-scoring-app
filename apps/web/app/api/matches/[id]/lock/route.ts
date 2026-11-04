/**
 * The scoring lock API (PHASE_4_PLAN.md §3). `POST` takes `{ action, ... }`:
 * acquire | heartbeat | release | handoff | takeover. `GET` shows the current lock to scorers.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ScoringError } from "@/features/scoring/errors";
import {
	acquireLock,
	getLock,
	heartbeatLock,
	offerHandoff,
	releaseLock,
	takeOverLock,
} from "@/features/scoring/lock";
import { publishLock } from "@/features/scoring/publish";
import { publish } from "@/lib/realtime";
import { errorResponse, json, sameOrigin } from "@/lib/services/http";
import { serviceContext } from "@/lib/services/server";

const MatchId = z.uuid();
const actions = {
	acquire: acquireLock,
	heartbeat: heartbeatLock,
	release: releaseLock,
	handoff: offerHandoff,
	takeover: takeOverLock,
} as const;

const failure = (error: unknown, subject: Parameters<typeof errorResponse>[1]) =>
	error instanceof ScoringError
		? json({ code: error.code, error: error.message, ...error.details }, error.status)
		: errorResponse(error, subject);

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/matches/[id]/lock">) {
	const id = MatchId.safeParse((await ctx.params).id);
	if (!id.success) return json({ code: "NOT_FOUND", error: "Match not found" }, 404);
	const service = await serviceContext();
	try {
		return json(await getLock(service, id.data));
	} catch (error) {
		return failure(error, service.subject);
	}
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/matches/[id]/lock">) {
	if (!sameOrigin(request)) return json({ code: "FORBIDDEN", error: "Cross-origin request" }, 403);
	const id = MatchId.safeParse((await ctx.params).id);
	if (!id.success) return json({ code: "NOT_FOUND", error: "Match not found" }, 404);
	const body: unknown = await request.json().catch(() => null);
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return json({ code: "INVALID", error: "Expected a JSON object" }, 400);
	}
	const { action, ...input } = body as Record<string, unknown>;
	if (typeof action !== "string" || !Object.hasOwn(actions, action)) {
		return json({ code: "INVALID", error: "Unknown lock action" }, 400);
	}
	const service = await serviceContext();
	try {
		const result = await actions[action as keyof typeof actions](service, id.data, input);
		const { lock, live } = await getLock(service, id.data);
		await publishLock(publish, id.data, lock, !live);
		return json(result);
	} catch (error) {
		return failure(error, service.subject);
	}
}
