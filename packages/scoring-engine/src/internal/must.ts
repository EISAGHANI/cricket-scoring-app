/**
 * Unwraps a value the engine's invariants guarantee is present. Throwing here means an engine bug,
 * not a rule violation, so it is a plain Error.
 */
export function must<T>(value: T | null | undefined, what: string): T {
	if (value === null || value === undefined)
		throw new Error(`Engine invariant broken: missing ${what}`);
	return value;
}
