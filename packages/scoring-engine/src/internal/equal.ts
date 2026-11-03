/** Structural equality for plain JSON data, independent of object key order (JSONB reorders keys). */
export function jsonEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	const keys = Object.keys(left);
	if (keys.length !== Object.keys(right).length) return false;
	return keys.every((k) => Object.hasOwn(right, k) && jsonEqual(left[k], right[k]));
}
