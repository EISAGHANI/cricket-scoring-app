import type { Subject } from "@cricket/authz";
import type { Database, Executor } from "@cricket/db";

/** Everything a service needs: a database handle and who is acting. */
export interface ServiceContext {
	db: Database;
	subject: Subject | null;
	/** Client IP for the audit log, when known. */
	ip?: string | null;
}

export type { Executor };
