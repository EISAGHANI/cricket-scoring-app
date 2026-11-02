import "server-only";
import type { Subject } from "@cricket/authz";
import { schema } from "@cricket/db";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db";
import { auth } from "./auth";

/** The narrow view of the signed-in user that pages and components receive. */
export interface CurrentUser {
	id: string;
	name: string;
	email: string | null;
	phoneNumber: string | null;
	image: string | null;
}

const PLACEHOLDER_EMAIL = /@phone\.cricket\.invalid$/;

/**
 * Reads the session from the request (once per request, via React cache). Request-time data:
 * callers must render inside a <Suspense> boundary (Cache Components).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
	// Session checks compare expiry with the current time: always evaluate at request time,
	// never during (runtime) prerendering.
	await connection();
	const session = await auth.api.getSession({ headers: await headers() });
	if (session === null) return null;
	const u = session.user as typeof session.user & { phoneNumber?: string | null };
	return {
		id: u.id,
		name: u.name,
		email: PLACEHOLDER_EMAIL.test(u.email) ? null : u.email,
		phoneNumber: u.phoneNumber ?? null,
		image: u.image ?? null,
	};
});

/** Redirects to sign-in when signed out. */
export async function requireUser(next: string): Promise<CurrentUser> {
	const user = await getCurrentUser();
	if (user === null) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
	return user;
}

/** The authorization subject (user + role assignments) for permission checks. */
export const getSubject = cache(async (): Promise<Subject | null> => {
	const user = await getCurrentUser();
	if (user === null) return null;
	const roles = await db
		.select({
			role: schema.roleAssignments.role,
			scopeType: schema.roleAssignments.scopeType,
			scopeId: schema.roleAssignments.scopeId,
		})
		.from(schema.roleAssignments)
		.where(eq(schema.roleAssignments.userId, user.id));
	return { userId: user.id, roles };
});
