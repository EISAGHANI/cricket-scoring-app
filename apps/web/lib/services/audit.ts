import { schema, type Executor } from "@cricket/db";

export interface AuditEntry {
	actorId: string | null;
	action: string;
	resourceType: string;
	resourceId: string | null;
	organizationId?: string | null;
	before?: unknown;
	after?: unknown;
	ip?: string | null;
}

/** Append to the audit log. Call inside the same transaction as the change (brief §6). */
export async function audit(tx: Executor, entry: AuditEntry): Promise<void> {
	await tx.insert(schema.auditLog).values({
		actorId: entry.actorId,
		action: entry.action,
		resourceType: entry.resourceType,
		resourceId: entry.resourceId,
		organizationId: entry.organizationId ?? null,
		before: entry.before ?? null,
		after: entry.after ?? null,
		ip: entry.ip ?? null,
	});
}
