/** A cricket-rule violation. The event is rejected and the state is unchanged (R-LC-03). */
export class RuleViolation extends Error {
	override readonly name = "RuleViolation";
	constructor(
		/** Stable machine code, e.g. "BOWLER_CONSECUTIVE_OVERS". Shown to clients as the 409 reason. */
		readonly code: string,
		/** Rule ID from docs/CRICKET_RULES.md, e.g. "R-OV-05". */
		readonly rule: string,
		message: string,
		/** Sequence number of the offending event, when known. */
		readonly seq: number | null = null,
	) {
		super(message);
	}
}

export function violation(code: string, rule: string, message: string): never {
	throw new RuleViolation(code, rule, message);
}

export function assertNever(value: never): never {
	throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}
