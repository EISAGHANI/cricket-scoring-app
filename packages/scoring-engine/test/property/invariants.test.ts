/** CRICKET_RULES.md §16 invariants over thousands of generated matches. */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RuleViolation, replay, replayFrom, resolveLog, tryApplyEvent } from "../../src";
import { initialState, reduceInPlace } from "../../src/reducer/apply";
import type { MatchEvent, PlayEvent } from "../../src/types/events";
import type { InningsState, MatchState } from "../../src/types/state";
import { generateMatch, PROPERTY_PRESETS, rng } from "./generator";

const RUNS = Number(process.env.PROPERTY_RUNS ?? 150);
const TIMEOUT = 10 * 60_000;
const seedAndPreset = fc.tuple(
	fc.integer({ min: 1, max: 2 ** 31 - 1 }),
	fc.constantFrom(...PROPERTY_PRESETS),
);

function checkInnings(inn: InningsState): void {
	const bat = inn.batters.reduce((n, b) => n + b.runs, 0);
	const e = inn.extras;
	// 1. Total = bat runs + extras.
	expect(inn.runs).toBe(bat + e.wides + e.noBalls + e.byes + e.legByes + e.penalties);
	// 2. Bowlers' runs + byes + leg byes + penalties = total.
	const bowled = inn.bowlers.reduce((n, b) => n + b.runs, 0);
	expect(bowled + e.byes + e.legByes + e.penalties).toBe(inn.runs);
	// 3. Allocation and wicket limits.
	if (inn.maxOvers !== null) expect(inn.completedOvers).toBeLessThanOrEqual(inn.maxOvers);
	expect(inn.wickets).toBeLessThanOrEqual(inn.maxWickets);
	// 7. Striker and non-striker are distinct, batting, from the batting side.
	if (inn.status === "IN_PROGRESS") {
		expect(inn.strikerId === null || inn.strikerId !== inn.nonStrikerId).toBe(true);
		for (const id of [inn.strikerId, inn.nonStrikerId]) {
			if (id !== null) expect(inn.batters.find((b) => b.playerId === id)?.status).toBe("BATTING");
		}
	}
	// 8. Partnerships account for every run scored in play; FoW per wicket.
	const partnershipRuns = inn.partnerships.reduce((n, p) => n + p.runs, 0);
	expect(partnershipRuns + inn.pendingPartnershipRuns).toBe(inn.runs - inn.penaltyRunsOutsidePlay);
	expect(inn.fallOfWickets).toHaveLength(inn.batters.filter((b) => b.status === "OUT").length);
	expect(inn.fallOfWickets.length).toBe(inn.wickets);
	// 9. Bowlers' legal balls = innings legal balls.
	expect(inn.bowlers.reduce((n, b) => n + b.legalBalls, 0)).toBe(inn.legalBalls);
}

function fold(events: readonly PlayEvent[]): MatchState {
	const s = initialState();
	for (const e of events) reduceInPlace(s, e, {});
	return s;
}

describe("invariants (property-based)", () => {
	it(
		"R-RUN-05 R-INN-04 R-INN-05: scoring invariants hold at every step of generated matches",
		() => {
			fc.assert(
				fc.property(seedAndPreset, ([seed, preset]) => {
					const g = generateMatch(seed, preset);
					expect(g.state.status === "COMPLETE" || g.log.length >= 4000).toBe(true);
					for (const s of g.checkpoints) for (const inn of s.innings) checkInnings(inn);
				}),
				{ numRuns: RUNS },
			);
		},
		TIMEOUT,
	);

	it(
		"R-LC-04 R-LC-05: replay is deterministic and equals the incremental fold",
		() => {
			fc.assert(
				fc.property(seedAndPreset, ([seed, preset]) => {
					const g = generateMatch(seed, preset);
					expect(replay(g.log)).toEqual(g.state);
					expect(replay(g.log)).toEqual(replay(g.log));
				}),
				{ numRuns: RUNS },
			);
		},
		TIMEOUT,
	);

	it(
		"R-LC-05: replaying from any snapshot equals a full replay",
		() => {
			fc.assert(
				fc.property(
					seedAndPreset,
					fc.double({ min: 0, max: 1, noNaN: true }),
					([seed, preset], at) => {
						const g = generateMatch(seed, preset);
						const play = resolveLog(g.log);
						const k = Math.floor(at * play.length);
						expect(replayFrom(fold(play.slice(0, k)), play.slice(k))).toEqual(g.state);
					},
				),
				{ numRuns: RUNS },
			);
		},
		TIMEOUT,
	);

	it(
		"R-UNDO-02 R-UNDO-03: undo removes exactly the last event; redo restores it",
		() => {
			fc.assert(
				fc.property(seedAndPreset, ([seed, preset]) => {
					const g = generateMatch(seed, preset);
					const play = resolveLog(g.log);
					const last = play[play.length - 1]!;
					if (last.type === "MATCH_STARTED") return;
					const n = g.log.length;
					const undo: MatchEvent = {
						id: "u1",
						seq: n + 1,
						type: "UNDO",
						payload: { targetId: last.id },
					};
					const redo: MatchEvent = {
						id: "u2",
						seq: n + 2,
						type: "UNDO",
						payload: { targetId: "u1" },
					};
					expect(replay([...g.log, undo])).toEqual(fold(play.slice(0, -1)));
					expect(replay([...g.log, undo, redo])).toEqual(g.state);
				}),
				{ numRuns: RUNS },
			);
		},
		TIMEOUT,
	);

	it(
		"R-LC-03: hostile events are rejected with RuleViolation, never an internal error",
		() => {
			const types: PlayEvent["type"][] = [
				"TOSS",
				"INNINGS_STARTED",
				"DELIVERY",
				"WICKET",
				"BATTER_IN",
				"BOWLER_CHANGE",
				"END_OF_OVER",
				"PENALTY_RUNS",
				"RETIREMENT",
				"SUBSTITUTION",
				"SWAP_STRIKE",
				"DECLARATION",
				"FOLLOW_ON",
				"INTERRUPTION",
				"PLAY_RESUMED",
				"TARGET_REVISED",
				"INNINGS_ENDED",
				"SUPER_OVER_STARTED",
				"BOWL_OUT_RESULT",
				"MATCH_RESULT",
			];
			fc.assert(
				fc.property(
					seedAndPreset,
					fc.integer({ min: 1, max: 1e9 }),
					([seed, preset], hostileSeed) => {
						const g = generateMatch(seed, preset, 400);
						const r = rng(hostileSeed);
						const pick = <T>(l: readonly T[]): T => l[Math.floor(r() * l.length)]!;
						const ids = [...Object.keys(g.state.players), "nobody"];
						const teams = ["A", "B", "Z"];
						for (let i = 0; i < 25; i++) {
							const state = pick(g.checkpoints);
							const type = pick(types);
							const payload = hostilePayload(type, pick, ids, teams, r);
							const event = { id: `h${i}`, seq: state.lastSeq + 1, type, payload } as PlayEvent;
							const result = tryApplyEvent(state, event);
							if (!result.ok) expect(result.error).toBeInstanceOf(RuleViolation);
						}
					},
				),
				{ numRuns: RUNS },
			);
		},
		TIMEOUT,
	);
});

function hostilePayload(
	type: PlayEvent["type"],
	pick: <T>(l: readonly T[]) => T,
	ids: string[],
	teams: string[],
	r: () => number,
): unknown {
	const n = (): number => pick([-1, 0, 1, 2, 3, 4, 5, 6, 7, 21, 1.5]);
	const kind = <T>(l: readonly T[]): T => pick(l);
	switch (type) {
		case "TOSS":
			return { winnerTeamId: pick(teams), decision: kind(["BAT", "BOWL"]) };
		case "INNINGS_STARTED":
			return {
				battingTeamId: pick(teams),
				strikerId: pick(ids),
				nonStrikerId: pick(ids),
				bowlerId: pick(ids),
			};
		case "DELIVERY":
			return {
				runs: n(),
				boundary: kind([null, null, "FOUR", "SIX"]),
				overthrow: r() < 0.2,
				extra: kind([
					null,
					null,
					{ kind: "WIDE" },
					{ kind: "BYE" },
					{ kind: "LEG_BYE" },
					{ kind: "NO_BALL", runsFrom: kind(["BAT", "BYE", "LEG_BYE"]) },
				]),
				dismissal:
					r() < 0.5
						? null
						: {
								kind: kind([
									"BOWLED",
									"CAUGHT",
									"LBW",
									"RUN_OUT",
									"STUMPED",
									"HIT_WICKET",
									"OBSTRUCTING_THE_FIELD",
									"HIT_BALL_TWICE",
									"HANDLED_THE_BALL",
								]),
								batterId: pick(ids),
								fielderIds: r() < 0.5 ? [] : [pick(ids)],
								end: kind([null, "STRIKER", "NON_STRIKER"]),
								directHit: false,
							},
				penaltyRuns: kind([0, 0, 5, -1]),
				overMiscount: r() < 0.1,
				detail: null,
			};
		case "WICKET":
			return {
				kind: kind(["TIMED_OUT", "RUN_OUT", "OBSTRUCTING_THE_FIELD", "HANDLED_THE_BALL"]),
				batterId: pick(ids),
				fielderIds: [],
			};
		case "BATTER_IN":
			return { batterId: pick(ids) };
		case "BOWLER_CHANGE":
			return { bowlerId: pick(ids), reason: kind(["NEW_OVER", "INJURY", "SUSPENDED", "OTHER"]) };
		case "END_OF_OVER":
			return { reason: kind(["NORMAL", "MISCOUNT"]) };
		case "PENALTY_RUNS":
			return { toTeamId: pick(teams), runs: n(), reason: "x" };
		case "RETIREMENT":
			return { batterId: pick(ids), kind: kind(["HURT", "OUT"]) };
		case "SUBSTITUTION":
			return {
				kind: kind(["CONCUSSION", "IMPACT", "FIELDING"]),
				teamId: pick(teams),
				outPlayerId: pick(ids),
				inPlayerId: pick(ids),
			};
		case "SWAP_STRIKE":
			return { reason: "x" };
		case "DECLARATION":
			return { teamId: pick(teams) };
		case "FOLLOW_ON":
			return { enforced: r() < 0.5 };
		case "INTERRUPTION":
			return { kind: kind(["RAIN", "STUMPS"]) };
		case "PLAY_RESUMED":
			return {
				revisedOvers: kind([null, 0, 1, 3, 100]),
				revisedBowlerMaxOvers: kind([null, 0, 1]),
			};
		case "TARGET_REVISED":
			return { target: n(), overs: n(), override: r() < 0.5 };
		case "INNINGS_ENDED":
			return { reason: kind(["ALL_OUT", "FORFEITED"]) };
		case "SUPER_OVER_STARTED":
			return { round: n() };
		case "BOWL_OUT_RESULT":
			return { winnerTeamId: pick(teams) };
		case "MATCH_RESULT":
			return {
				result: kind([
					{ kind: "TIE" },
					{ kind: "DRAW" },
					{ kind: "NO_RESULT" },
					{ kind: "WIN", winnerTeamId: pick(teams), margin: { type: "NONE" }, method: "AWARDED" },
				]),
				override: r() < 0.3,
			};
		default:
			return {};
	}
}
