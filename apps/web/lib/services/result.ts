import { Forbidden } from "@cricket/authz";
import { z } from "zod";
import { ServiceError } from "./errors";

/** What a Server Action returns to its form. */
export type ActionResult<T = null> =
	{ ok: true; data: T } | { ok: false; error: string; fieldErrors: Record<string, string> };

export const initialActionState: ActionResult<never> | null = null;

/** Parse input with a Zod schema; failures become field errors. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
	const result = schema.safeParse(input);
	if (result.success) return result.data;
	const fieldErrors: Record<string, string> = {};
	for (const issue of result.error.issues) {
		const key = issue.path.join(".") || "_";
		fieldErrors[key] ??= issue.message;
	}
	throw new ServiceError("INVALID", "Please check the highlighted fields.", fieldErrors);
}

/** Run a mutation and map expected failures to an ActionResult; unexpected errors still throw. */
export async function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
	try {
		return { ok: true, data: await fn() };
	} catch (error) {
		if (error instanceof ServiceError)
			return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
		if (error instanceof Forbidden) {
			return { ok: false, error: "You don't have permission to do that.", fieldErrors: {} };
		}
		throw error;
	}
}

/** FormData → plain object; empty strings become undefined so optional fields stay optional. */
export function formObject(form: FormData): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	for (const [k, v] of form.entries())
		if (typeof v === "string") out[k] = v.trim() === "" ? undefined : v.trim();
	return out;
}
