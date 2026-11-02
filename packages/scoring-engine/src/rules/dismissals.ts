/** CRICKET_RULES.md §8 as data, so the rules are table-driven rather than branch-driven. */
import type { DeliveryDismissalKind, DismissalKind } from "../types/events";

type DeliveryType = "LEGAL" | "WIDE" | "NO_BALL" | "BYE";

interface DismissalRule {
	creditsBowler: boolean;
	/** Delivery types on which this dismissal is possible. */
	on: readonly DeliveryType[];
	/** Possible on a free hit (or a no-ball). */
	onFreeHit: boolean;
	/** Only the striker can be out this way. */
	strikerOnly: boolean;
	/** Runs completed are allowed (run outs). Otherwise the ball is dead: runs must be 0. */
	allowsRuns: boolean;
}

export const DISMISSAL_RULES: Readonly<Record<DeliveryDismissalKind, DismissalRule>> = {
	BOWLED: {
		creditsBowler: true,
		on: ["LEGAL"],
		onFreeHit: false,
		strikerOnly: true,
		allowsRuns: false,
	},
	CAUGHT: {
		creditsBowler: true,
		on: ["LEGAL"],
		onFreeHit: false,
		strikerOnly: true,
		allowsRuns: false,
	},
	LBW: {
		creditsBowler: true,
		on: ["LEGAL"],
		onFreeHit: false,
		strikerOnly: true,
		allowsRuns: false,
	},
	STUMPED: {
		creditsBowler: true,
		on: ["LEGAL", "WIDE"],
		onFreeHit: false,
		strikerOnly: true,
		allowsRuns: false,
	},
	HIT_WICKET: {
		creditsBowler: true,
		on: ["LEGAL", "WIDE"],
		onFreeHit: false,
		strikerOnly: true,
		allowsRuns: false,
	},
	HIT_BALL_TWICE: {
		creditsBowler: false,
		on: ["LEGAL", "NO_BALL"],
		onFreeHit: true,
		strikerOnly: true,
		allowsRuns: false,
	},
	RUN_OUT: {
		creditsBowler: false,
		on: ["LEGAL", "WIDE", "NO_BALL", "BYE"],
		onFreeHit: true,
		strikerOnly: false,
		allowsRuns: true,
	},
	OBSTRUCTING_THE_FIELD: {
		creditsBowler: false,
		on: ["LEGAL", "WIDE", "NO_BALL", "BYE"],
		onFreeHit: true,
		strikerOnly: false,
		allowsRuns: true,
	},
	HANDLED_THE_BALL: {
		creditsBowler: false,
		on: ["LEGAL", "WIDE", "NO_BALL", "BYE"],
		onFreeHit: true,
		strikerOnly: false,
		allowsRuns: true,
	},
};

export function deliveryTypeOf(
	extraKind: "WIDE" | "NO_BALL" | "BYE" | "LEG_BYE" | null,
): DeliveryType {
	if (extraKind === null) return "LEGAL";
	if (extraKind === "LEG_BYE") return "BYE";
	return extraKind;
}

export function creditsBowler(kind: DismissalKind): boolean {
	return kind in DISMISSAL_RULES && DISMISSAL_RULES[kind as DeliveryDismissalKind].creditsBowler;
}

/** Dismissal kinds possible for a delivery of this type (R-DIS-01). */
export function allowedDismissalKinds(
	extraKind: "WIDE" | "NO_BALL" | "BYE" | "LEG_BYE" | null,
	freeHit: boolean,
	allowHandledTheBall: boolean,
): DeliveryDismissalKind[] {
	const type = deliveryTypeOf(extraKind);
	return (Object.keys(DISMISSAL_RULES) as DeliveryDismissalKind[]).filter((kind) => {
		const rule = DISMISSAL_RULES[kind];
		if (kind === "HANDLED_THE_BALL" && !allowHandledTheBall) return false;
		if (!rule.on.includes(type)) return false;
		return !freeHit || rule.onFreeHit;
	});
}
