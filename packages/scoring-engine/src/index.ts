/**
 * @cricket/scoring-engine — public API. Pure, deterministic, no I/O (ADR-0006).
 * The rules it implements are specified in docs/CRICKET_RULES.md.
 */
export const ENGINE_VERSION = "1.0.0";

export type * from "./types/ids";
export type * from "./types/rules";
export type * from "./types/events";
export type * from "./types/results";
export type * from "./types/state";

export { RuleViolation } from "./errors";
export { PRESETS, validateRules, type PresetId } from "./rules/presets";
export { DISMISSAL_RULES, allowedDismissalKinds, creditsBowler } from "./rules/dismissals";

export {
	initialState,
	applyEvent,
	tryApplyEvent,
	awaiting,
	type ApplyResult,
} from "./reducer/apply";
export type { EngineOptions } from "./reducer/officials";
export { parScore, resultIfNoMorePlay, computeRevisedTarget } from "./reducer/officials";
export {
	currentInnings,
	eligibleBatters,
	eligibleBowlers,
	needsBatter,
	needsBowler,
	overDue,
	ballsUsed,
	type BowlerEligibility,
} from "./reducer/context";
export { scoreDelivery, type DeliveryScore } from "./reducer/delivery";
export { aggregate, followOnMargin } from "./reducer/innings";

export { replay, replayFrom, appendEvent } from "./log/replay";
export { resolveLog } from "./log/resolve";

export * as metrics from "./metrics";
export { netRunRate, nrrInput, type NrrInput } from "./metrics";
export * as targetRevision from "./target-revision/strategies";
export type { ResourceTable } from "./target-revision/strategies";
export * as format from "./format";
