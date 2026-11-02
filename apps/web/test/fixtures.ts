import type { Subject } from "@cricket/authz";
import { schema, type Database } from "@cricket/db";
import { eq } from "drizzle-orm";
import type { ServiceContext } from "@/lib/services/context";

let n = 0;

/** Insert a user and return their id. */
export async function makeUser(db: Database, name = "User"): Promise<string> {
	const [u] = await db
		.insert(schema.users)
		.values({ name, email: `user${++n}.${Date.now()}@example.com`, emailVerified: true })
		.returning({ id: schema.users.id });
	return u!.id;
}

/** A fresh service context for a user, with their current role assignments. */
export async function as(db: Database, userId: string | null): Promise<ServiceContext> {
	if (userId === null) return { db, subject: null };
	const roles = await db
		.select({
			role: schema.roleAssignments.role,
			scopeType: schema.roleAssignments.scopeType,
			scopeId: schema.roleAssignments.scopeId,
		})
		.from(schema.roleAssignments)
		.where(eq(schema.roleAssignments.userId, userId));
	const subject: Subject = { userId, roles };
	return { db, subject };
}
