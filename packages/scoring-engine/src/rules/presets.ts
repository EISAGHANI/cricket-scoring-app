import { violation } from "../errors";
import type { MatchRules } from "../types/rules";

export type PresetId =
	| "TEST"
	| "FIRST_CLASS_4DAY"
	| "ODI"
	| "T20"
	| "T10"
	| "HUNDRED"
	| "LAST_MAN_STANDS"
	| "BOX_CRICKET"
	| "CUSTOM";

const LIMITED: MatchRules = {
	format: "LIMITED",
	playersPerSide: 11,
	ballsPerOver: 6,
	oversPerInnings: 50,
	inningsPerSide: 1,
	maxDays: null,
	bowlerMaxOvers: null,
	bowlerMaxBalls: null,
	maxConsecutiveOvers: 1,
	oversPerEnd: 1,
	wideRuns: 1,
	noBallRuns: 1,
	freeHit: "ALL_NO_BALLS",
	noBallByesScoredAs: "BYES",
	lastManStands: false,
	allowHandledTheBall: false,
	boundaryFour: 4,
	boundarySix: 6,
	tieBreaker: "SUPER_OVER_REPEAT",
	superOverBalls: 6,
	superOverWickets: 2,
	followOnEnabled: false,
	followOnMargin: null,
	concussionReplacements: true,
	impactPlayersPerTeam: 0,
	retiredHurtMayReturn: true,
	powerplays: [],
	minOversForResult: null,
	targetRevision: "DLS_STANDARD",
	dlsG50: 245,
};

const TEST: MatchRules = {
	...LIMITED,
	format: "TEST",
	oversPerInnings: null,
	inningsPerSide: 2,
	maxDays: 5,
	freeHit: "NONE",
	tieBreaker: "NONE",
	followOnEnabled: true,
	targetRevision: "MANUAL",
	dlsG50: null,
};

/**
 * Presets are plain MatchRules values: there is no preset-specific code path.
 * LAST_MAN_STANDS and BOX_CRICKET are common club variants; organisers should adjust them.
 */
export const PRESETS: Readonly<Record<PresetId, MatchRules>> = {
	TEST,
	FIRST_CLASS_4DAY: { ...TEST, format: "FIRST_CLASS_4DAY", maxDays: 4 },
	ODI: {
		...LIMITED,
		format: "ODI",
		oversPerInnings: 50,
		bowlerMaxOvers: 10,
		powerplays: [
			{ name: "P1", fromOver: 1, toOver: 10 },
			{ name: "P2", fromOver: 11, toOver: 40 },
			{ name: "P3", fromOver: 41, toOver: 50 },
		],
		minOversForResult: 20,
	},
	T20: {
		...LIMITED,
		format: "T20",
		oversPerInnings: 20,
		bowlerMaxOvers: 4,
		powerplays: [{ name: "Powerplay", fromOver: 1, toOver: 6 }],
		minOversForResult: 5,
	},
	T10: {
		...LIMITED,
		format: "T10",
		oversPerInnings: 10,
		bowlerMaxOvers: 2,
		powerplays: [{ name: "Powerplay", fromOver: 1, toOver: 3 }],
		minOversForResult: 5,
	},
	HUNDRED: {
		...LIMITED,
		format: "HUNDRED",
		ballsPerOver: 5,
		oversPerInnings: 20,
		bowlerMaxBalls: 20,
		noBallRuns: 2,
		maxConsecutiveOvers: 2,
		oversPerEnd: 2,
		superOverBalls: 5,
		powerplays: [{ name: "Powerplay", fromOver: 1, toOver: 5 }],
		minOversForResult: 5,
	},
	LAST_MAN_STANDS: {
		...LIMITED,
		format: "LAST_MAN_STANDS",
		playersPerSide: 8,
		oversPerInnings: 20,
		bowlerMaxOvers: 4,
		lastManStands: true,
		tieBreaker: "NONE",
		targetRevision: "ARR",
		dlsG50: null,
	},
	BOX_CRICKET: {
		...LIMITED,
		format: "BOX_CRICKET",
		playersPerSide: 8,
		oversPerInnings: 8,
		bowlerMaxOvers: 2,
		tieBreaker: "SUPER_OVER",
		targetRevision: "ARR",
		dlsG50: null,
	},
	CUSTOM: {
		...LIMITED,
		format: "CUSTOM",
		oversPerInnings: 20,
		targetRevision: "ARR",
		dlsG50: null,
	},
};

function positiveInt(n: number, max: number): boolean {
	return Number.isInteger(n) && n >= 1 && n <= max;
}

/** Structural sanity checks on a rules object (R-LC-01). Shape is validated by @cricket/schemas. */
export function validateRules(rules: MatchRules): void {
	const bad = (field: string): never =>
		violation("INVALID_RULES", "R-LC-01", `Invalid match rules: ${field}`);
	if (!positiveInt(rules.playersPerSide, 15) || rules.playersPerSide < 2) bad("playersPerSide");
	if (!positiveInt(rules.ballsPerOver, 10)) bad("ballsPerOver");
	if (rules.oversPerInnings !== null && !positiveInt(rules.oversPerInnings, 500))
		bad("oversPerInnings");
	if (rules.inningsPerSide === 2 && rules.oversPerInnings !== null)
		bad("oversPerInnings (multi-day is unlimited)");
	if (rules.inningsPerSide === 1 && rules.oversPerInnings === null)
		bad("oversPerInnings (required)");
	if (rules.bowlerMaxOvers !== null && !positiveInt(rules.bowlerMaxOvers, 500))
		bad("bowlerMaxOvers");
	if (rules.bowlerMaxBalls !== null && !positiveInt(rules.bowlerMaxBalls, 5000))
		bad("bowlerMaxBalls");
	if (!positiveInt(rules.maxConsecutiveOvers, 10)) bad("maxConsecutiveOvers");
	if (!positiveInt(rules.oversPerEnd, 10)) bad("oversPerEnd");
	if (!Number.isInteger(rules.wideRuns) || rules.wideRuns < 0) bad("wideRuns");
	if (!Number.isInteger(rules.noBallRuns) || rules.noBallRuns < 0) bad("noBallRuns");
	if (!positiveInt(rules.superOverBalls, 10)) bad("superOverBalls");
	if (!positiveInt(rules.superOverWickets, rules.playersPerSide)) bad("superOverWickets");
	if (rules.targetRevision === "DLS_STANDARD" && rules.dlsG50 === null) bad("dlsG50");
}
