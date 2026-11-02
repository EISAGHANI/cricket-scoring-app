/**
 * Model-based generator of valid matches. It asks the engine what is allowed next (awaiting,
 * eligibility, allowed dismissals) and picks randomly, so every log it produces should be
 * accepted. Any RuleViolation while generating is itself a failure.
 */
import { appendEvent } from "../../src/log/replay";
import { resolveLog } from "../../src/log/resolve";
import { initialState } from "../../src/reducer/apply";
import {
	currentInnings,
	eligibleBatters,
	eligibleBowlers,
	needsBatter,
	needsBowler,
	overDue,
} from "../../src/reducer/context";
import { nextInnings, tieBreakPending } from "../../src/reducer/innings";
import { allowedDismissalKinds, DISMISSAL_RULES } from "../../src/rules/dismissals";
import { PRESETS, type PresetId } from "../../src/rules/presets";
import type { DeliveryPayload, MatchEvent, PlayEvent } from "../../src/types/events";
import type { MatchRules } from "../../src/types/rules";
import type { MatchState } from "../../src/types/state";
import { DOT, sheet } from "../dsl";

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface Generated {
	rules: MatchRules;
	log: MatchEvent[];
	state: MatchState;
	/** States after each event (for intermediate invariant checks). */
	checkpoints: MatchState[];
}

type EventOf<T extends PlayEvent["type"]> = Extract<PlayEvent, { type: T }>;

export const PROPERTY_PRESETS: PresetId[] = [
	"T20",
	"ODI",
	"T10",
	"HUNDRED",
	"LAST_MAN_STANDS",
	"BOX_CRICKET",
	"TEST",
	"CUSTOM",
];

export function generateMatch(seed: number, preset: PresetId, maxEvents = 4000): Generated {
	const r = rng(seed);
	const pick = <T>(list: readonly T[]): T => {
		const v = list[Math.floor(r() * list.length)];
		if (v === undefined) throw new Error("pick from empty list");
		return v;
	};
	const chance = (p: number): boolean => r() < p;

	const base = PRESETS[preset];
	const players = base.playersPerSide;
	const rules: MatchRules = {
		...base,
		// Keep limited-overs games short and vary the conventions under test.
		oversPerInnings:
			base.oversPerInnings === null ? null : Math.min(base.oversPerInnings, pick([2, 5, 10])),
		noBallByesScoredAs: pick(["BYES", "NO_BALLS"] as const),
		tieBreaker:
			base.inningsPerSide === 2
				? "NONE"
				: pick([
						"NONE",
						"SUPER_OVER",
						"SUPER_OVER_REPEAT",
						"SUPER_OVER_THEN_BOUNDARY_COUNT",
						"BOWL_OUT",
					] as const),
		bowlerMaxOvers:
			base.bowlerMaxOvers === null
				? null
				: Math.max(1, Math.ceil((base.oversPerInnings ?? 10) / 5)),
	};

	let log: MatchEvent[] = [];
	let state = initialState();
	const checkpoints: MatchState[] = [];
	let id = 0;
	const push = (event: MatchEvent): void => {
		const next = appendEvent(log, state, event);
		log = next.log;
		state = next.state;
		checkpoints.push(state);
	};
	const emit = <T extends PlayEvent["type"]>(type: T, payload: EventOf<T>["payload"]): void => {
		push({ id: `g${++id}`, seq: log.length + 1, type, payload } as EventOf<T>);
	};
	/** UNDO the latest effective event; returns false when there is nothing to undo. */
	const undoLast = (): boolean => {
		const last = resolveLog(log).at(-1);
		if (last === undefined || last.type === "MATCH_STARTED") return false;
		push({ id: `g${++id}`, seq: log.length + 1, type: "UNDO", payload: { targetId: last.id } });
		return true;
	};

	emit("MATCH_STARTED", { rules, teams: [sheet("A", players), sheet("B", players)] });
	emit("TOSS", { winnerTeamId: pick(["A", "B"]), decision: pick(["BAT", "BOWL"] as const) });

	while (state.status !== "COMPLETE" && log.length < maxEvents) {
		if (state.interrupted) {
			emit("PLAY_RESUMED", { revisedOvers: null, revisedBowlerMaxOvers: null });
			continue;
		}
		const inn = currentInnings(state);
		if (inn === null) {
			if (state.provisionalResult !== null) {
				emit("MATCH_RESULT", { result: state.provisionalResult, override: false });
				continue;
			}
			if (state.followOn.available && state.followOn.enforced === null) {
				emit("FOLLOW_ON", { enforced: chance(0.5) });
				continue;
			}
			const tie = tieBreakPending(state);
			if (tie === "SUPER_OVER") {
				emit("SUPER_OVER_STARTED", { round: state.superOverRound + 1 });
				continue;
			}
			if (tie === "BOWL_OUT") {
				emit("BOWL_OUT_RESULT", { winnerTeamId: pick(["A", "B"]) });
				continue;
			}
			const plan = nextInnings(state);
			if (plan === null) {
				emit("MATCH_RESULT", {
					result: { kind: rules.inningsPerSide === 2 ? "DRAW" : "NO_RESULT" },
					override: false,
				});
				continue;
			}
			if (rules.inningsPerSide === 2 && chance(0.03)) {
				emit("INNINGS_ENDED", { reason: "FORFEITED" });
				continue;
			}
			// Build a provisional innings to ask the engine who may open and bowl.
			const batters = Object.values(state.players)
				.filter((p) => p.teamId === plan.battingTeamId && p.role === "XI")
				.map((p) => p.id);
			const openers = shuffle(batters, r);
			const bowlers = Object.values(state.players)
				.filter((p) => p.teamId !== plan.battingTeamId && p.role === "XI")
				.map((p) => p.id);
			emitInningsStart(state, emit, plan.battingTeamId, openers, shuffle(bowlers, r));
			continue;
		}

		if (needsBatter(inn)) {
			const options = eligibleBatters(state, inn);
			if (options.length === 0) emit("INNINGS_ENDED", { reason: "ALL_OUT" });
			else if (chance(0.01) && options.some((o) => inn.batters.every((b) => b.playerId !== o))) {
				const fresh = options.filter((o) => inn.batters.every((b) => b.playerId !== o));
				emit("WICKET", { kind: "TIMED_OUT", batterId: pick(fresh), fielderIds: [] });
			} else emit("BATTER_IN", { batterId: pick(options) });
			continue;
		}
		if (overDue(inn)) {
			emit("END_OF_OVER", { reason: "NORMAL" });
			continue;
		}
		if (needsBowler(inn)) {
			const options = eligibleBowlers(state, inn).filter((b) => b.eligible);
			if (options.length === 0)
				emit("MATCH_RESULT", { result: { kind: "ABANDONED" }, override: false });
			else emit("BOWLER_CHANGE", { bowlerId: pick(options).playerId, reason: "NEW_OVER" });
			continue;
		}

		const roll = r();
		if (roll < 0.02 && log.length > 5) {
			if (undoLast() && chance(0.3)) {
				const last = log[log.length - 1]!;
				push({ id: `g${++id}`, seq: log.length + 1, type: "UNDO", payload: { targetId: last.id } });
			}
			continue;
		}
		if (roll < 0.025) {
			const batter = inn.strikerId ?? inn.nonStrikerId;
			if (batter !== null)
				emit("RETIREMENT", { batterId: batter, kind: chance(0.7) ? "HURT" : "OUT" });
			continue;
		}
		if (roll < 0.028) {
			emit("PENALTY_RUNS", { toTeamId: pick(["A", "B"]), runs: 5, reason: "generated" });
			continue;
		}
		if (roll < 0.031 && inn.nonStrikerId !== null && inn.strikerId !== null) {
			emit("SWAP_STRIKE", { reason: "generated" });
			continue;
		}
		if (roll < 0.034 && inn.currentOver !== null && inn.currentOver.balls.length > 0) {
			const options = eligibleBowlers(state, inn).filter((b) => b.eligible);
			if (options.length > 0)
				emit("BOWLER_CHANGE", {
					bowlerId: pick(options).playerId,
					reason: pick(["INJURY", "SUSPENDED"] as const),
				});
			continue;
		}
		if (roll < 0.036) {
			emit("INTERRUPTION", { kind: pick(["RAIN", "LUNCH", "STUMPS"] as const) });
			emit("PLAY_RESUMED", { revisedOvers: null, revisedBowlerMaxOvers: null });
			continue;
		}
		if (roll < 0.04 && rules.inningsPerSide === 2 && inn.legalBalls > 120) {
			emit("DECLARATION", { teamId: inn.battingTeamId });
			continue;
		}
		if (
			roll < 0.045 &&
			rules.inningsPerSide === 2 &&
			state.innings.length >= 3 &&
			inn.legalBalls > 60
		) {
			emit("MATCH_RESULT", { result: { kind: "DRAW" }, override: false });
			continue;
		}
		emit("DELIVERY", randomDelivery(state, r, pick, chance));
	}
	return { rules, log, state, checkpoints };
}

function shuffle<T>(list: T[], r: () => number): T[] {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(r() * (i + 1));
		[out[i], out[j]] = [out[j]!, out[i]!];
	}
	return out;
}

function emitInningsStart(
	state: MatchState,
	emit: <T extends PlayEvent["type"]>(type: T, payload: EventOf<T>["payload"]) => void,
	battingTeamId: string,
	batters: string[],
	bowlers: string[],
): void {
	// Super-over rounds bar some players; try candidates until the engine accepts them.
	for (let i = 0; i < batters.length; i++) {
		for (let j = i + 1; j < batters.length; j++) {
			for (const bowlerId of bowlers) {
				try {
					emit("INNINGS_STARTED", {
						battingTeamId,
						strikerId: batters[i]!,
						nonStrikerId: batters[j]!,
						bowlerId,
					});
					return;
				} catch {
					// try the next combination
				}
			}
		}
	}
	void state;
	throw new Error("no valid openers");
}

function randomDelivery(
	state: MatchState,
	r: () => number,
	pick: <T>(list: readonly T[]) => T,
	chance: (p: number) => boolean,
): DeliveryPayload {
	const inn = currentInnings(state)!;
	const rules = state.rules!;
	const p: DeliveryPayload = { ...DOT };
	const roll = r();
	if (roll < 0.35) p.runs = 0;
	else if (roll < 0.6) p.runs = 1;
	else if (roll < 0.68) p.runs = 2;
	else if (roll < 0.7) p.runs = 3;
	else if (roll < 0.8) p.boundary = "FOUR";
	else if (roll < 0.84) p.boundary = "SIX";
	else if (roll < 0.88) p.extra = { kind: "WIDE" };
	else if (roll < 0.9)
		p.extra = { kind: "NO_BALL", runsFrom: pick(["BAT", "BYE", "LEG_BYE"] as const) };
	else if (roll < 0.92) {
		p.extra = { kind: pick(["BYE", "LEG_BYE"] as const) };
		p.runs = 1;
	} else if (roll < 0.925) {
		p.runs = 2;
		p.boundary = "FOUR";
		p.overthrow = true;
	}
	if (p.extra !== null && p.extra.kind !== "BYE" && p.extra.kind !== "LEG_BYE" && chance(0.3))
		p.runs = pick([1, 2]);
	if (p.extra?.kind === "NO_BALL" && p.extra.runsFrom !== "BAT" && p.runs === 0) p.runs = 1;
	if (chance(0.005)) p.penaltyRuns = 5;

	if (roll >= 0.925 || chance(0.02)) {
		const kinds = allowedDismissalKinds(
			p.extra?.kind ?? null,
			inn.freeHit,
			rules.allowHandledTheBall,
		);
		const kind = pick(kinds);
		const rule = DISMISSAL_RULES[kind];
		if (!rule.allowsRuns) {
			p.runs = 0;
			p.boundary = null;
			p.overthrow = false;
		} else {
			p.boundary = null;
			p.overthrow = false;
		}
		const atCrease = [inn.strikerId, inn.nonStrikerId].filter((x): x is string => x !== null);
		const fielders = Object.values(state.players)
			.filter((pl) => pl.teamId === inn.bowlingTeamId && pl.role !== "REPLACED")
			.map((pl) => pl.id);
		p.dismissal = {
			kind,
			batterId: rule.strikerOnly ? inn.strikerId! : pick(atCrease),
			fielderIds: kind === "CAUGHT" ? [pick(fielders)] : kind === "RUN_OUT" ? [pick(fielders)] : [],
			end:
				kind === "RUN_OUT" && inn.nonStrikerId !== null
					? pick(["STRIKER", "NON_STRIKER", null] as const)
					: null,
			directHit: chance(0.3),
		};
		if (p.extra !== null && (p.extra.kind === "BYE" || p.extra.kind === "LEG_BYE") && p.runs === 0)
			p.runs = 1;
	}
	return p;
}
