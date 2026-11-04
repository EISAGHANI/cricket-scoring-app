/**
 * The scoring API (PHASE_3_PLAN.md §3). A Route Handler rather than a Server Action so the
 * Phase 4 offline queue can replay submissions with plain fetch.
 */
import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { matchTags } from "@/features/matches/tags";
import { publishEvents } from "@/features/scoring/publish";
import { eventsAfter, ScoringError, submitBatch, submitDetailed } from "@/features/scoring/service";
import { db } from "@/lib/db";
import { publish } from "@/lib/realtime";
import { errorResponse, json, sameOrigin } from "@/lib/services/http";
import { serviceContext } from "@/lib/services/server";

const MatchId = z.uuid();
const After = z.coerce.number().int().min(0).default(0);

const isBatch = (body: unknown): body is { submissions: unknown } =>
	typeof body === "object" && body !== null && "submissions" in body;

// The match page must show the new ball on its next render. Lists must show a match moving
// between live / upcoming / results at once; score changes may lag briefly.
function revalidate(matchId: string, statusChanged: boolean) {
	revalidateTag(matchTags.one(matchId), { expire: 0 });
	revalidateTag(matchTags.list, statusChanged ? { expire: 0 } : "max");
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/matches/[id]/events">) {
	const id = MatchId.safeParse((await ctx.params).id);
	const after = After.safeParse(request.nextUrl.searchParams.get("after") ?? undefined);
	if (!id.success || !after.success) return json({ code: "INVALID", error: "Bad request" }, 400);
	try {
		return json(await eventsAfter({ db }, id.data, after.data));
	} catch (error) {
		return errorResponse(error, null);
	}
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/matches/[id]/events">) {
	if (!sameOrigin(request)) return json({ code: "FORBIDDEN", error: "Cross-origin request" }, 403);
	const id = MatchId.safeParse((await ctx.params).id);
	if (!id.success) return json({ code: "NOT_FOUND", error: "Match not found" }, 404);
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ code: "INVALID", error: "Expected a JSON body" }, 400);
	}
	const service = await serviceContext();
	try {
		if (isBatch(body)) {
			const { result, stored } = await submitBatch(service, id.data, body.submissions);
			if (stored.length > 0) {
				revalidate(
					id.data,
					stored.some((s) => s.statusChanged),
				);
				await publishEvents(publish, id.data, stored);
			}
			return json(result);
		}
		const stored = await submitDetailed(service, id.data, body);
		const { event: _event, status: _status, ...result } = stored;
		if (!result.duplicate) {
			revalidate(id.data, result.statusChanged);
			await publishEvents(publish, id.data, [stored]);
		}
		return json(result);
	} catch (error) {
		if (error instanceof ScoringError) {
			return json({ code: error.code, error: error.message, ...error.details }, error.status);
		}
		return errorResponse(error, service.subject);
	}
}
