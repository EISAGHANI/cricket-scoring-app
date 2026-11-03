import { Forbidden, type Subject } from "@cricket/authz";
import { env } from "../env";
import { ServiceError } from "./errors";

const STATUS = { INVALID: 400, NOT_FOUND: 404, CONFLICT: 409 } as const;

export const json = (body: unknown, status = 200): Response =>
	Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Map expected service failures to JSON responses; unexpected errors still throw (500). */
export function errorResponse(error: unknown, subject: Subject | null): Response {
	if (error instanceof ServiceError) {
		return json(
			{ code: error.code, error: error.message, fieldErrors: error.fieldErrors },
			STATUS[error.code],
		);
	}
	if (error instanceof Forbidden) {
		return subject === null
			? json({ code: "UNAUTHENTICATED", error: "Please sign in." }, 401)
			: json({ code: "FORBIDDEN", error: "You don't have permission to do that." }, 403);
	}
	throw error;
}

/**
 * CSRF protection for cookie-authenticated Route Handlers (Server Actions check this themselves):
 * the browser's Origin header must be this app.
 */
export function sameOrigin(request: Request): boolean {
	const origin = request.headers.get("origin");
	if (origin === null) return false;
	return (
		origin === new URL(env.NEXT_PUBLIC_APP_URL).origin || origin === new URL(request.url).origin
	);
}
