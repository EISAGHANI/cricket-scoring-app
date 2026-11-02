import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect for signed-out visitors (cookie presence only, no database access).
 * Real permission checks happen in the data access layer and every Server Action.
 */
export function proxy(request: NextRequest) {
	if (getSessionCookie(request, { cookiePrefix: "cricket" }) === null) {
		const url = new URL("/sign-in", request.url);
		url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
		return NextResponse.redirect(url);
	}
	return NextResponse.next();
}

export const config = {
	// Pages that only make sense signed in.
	matcher: ["/me/:path*", "/clubs/new", "/teams/new", "/players/new"],
};
