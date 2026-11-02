import "server-only";
import { can, type Action, type Resource } from "@cricket/authz";
import { headers } from "next/headers";
import { getSubject } from "../auth/session";
import { db } from "../db";
import type { ServiceContext } from "./context";

/** The service context for the current request (Server Actions and server components). */
export async function serviceContext(): Promise<ServiceContext> {
	const h = await headers();
	const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
	return { db, subject: await getSubject(), ip };
}

/** Whether the current viewer may perform an action (for showing controls; services re-check). */
export async function viewerCan(action: Action, resource: Resource): Promise<boolean> {
	return can(await getSubject(), action, resource);
}
