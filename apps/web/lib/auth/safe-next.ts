/** Only same-site relative paths are allowed as post-sign-in destinations (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/me"): string {
	if (
		typeof next !== "string" ||
		!next.startsWith("/") ||
		next.startsWith("//") ||
		next.startsWith("/\\")
	) {
		return fallback;
	}
	return next;
}
