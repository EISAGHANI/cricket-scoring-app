/** Escape LIKE/ILIKE wildcards (and the escape character) in user input; wrap for "contains". */
export function containsPattern(input: string): string {
	return `%${input.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
