/** Errors services throw; actions map them to user-facing results (see result.ts). */
export class ServiceError extends Error {
	constructor(
		readonly code: "NOT_FOUND" | "CONFLICT" | "INVALID",
		message: string,
		readonly fieldErrors: Record<string, string> = {},
	) {
		super(message);
		this.name = "ServiceError";
	}
}

export const notFound = (what: string): ServiceError =>
	new ServiceError("NOT_FOUND", `${what} not found`);
export const conflict = (message: string, field?: string): ServiceError =>
	new ServiceError("CONFLICT", message, field === undefined ? {} : { [field]: message });
