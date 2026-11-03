/**
 * Plausible random play for demo data (brief §10): asks the engine what is allowed next and
 * picks a realistic event. Pure; the seed script posts the events through the real service.
 */
import {
	awaiting,
	currentInnings,
	eligibleBatters,
	eligibleBowlers,
	needsBatter,
	needsBowler,
	nextInnings,
	overDue,
	type DeliveryPayload,
	type MatchEventType,
	type MatchState,
} from "@cricket/scoring-engine";

export interface SimulatedEvent {
	type: MatchEventType;
	payload: unknown;
}

const ball = (p: Partial<DeliveryPayload> = {}): DeliveryPayload => ({
	runs: 0,
	boundary: null,
	overthrow: false,
	extra: null,
	dismissal: null,
	penaltyRuns: 0,
	overMiscount: false,
	detail: null,
	...p,
});

/** The next event of a simulated match, or null once it is complete. */
export function simulateNext(state: MatchState, rand: () => number): SimulatedEvent | null {
	if (state.status === "COMPLETE" || state.teams === null) return null;
	const [a, b] = state.teams;
	if (state.toss === null) {
		return {
			type: "TOSS",
			payload: {
				winnerTeamId: rand() < 0.5 ? a.teamId : b.teamId,
				decision: rand() < 0.6 ? "BAT" : "BOWL",
			},
		};
	}
	const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
	const inn = currentInnings(state);
	if (inn === null) {
		const next = awaiting(state);
		if (next.includes("SUPER_OVER_STARTED"))
			return { type: "SUPER_OVER_STARTED", payload: { round: state.superOverRound + 1 } };
		if (next.includes("BOWL_OUT_RESULT"))
			return { type: "BOWL_OUT_RESULT", payload: { winnerTeamId: a.teamId } };
		if (next.includes("FOLLOW_ON"))
			return { type: "FOLLOW_ON", payload: { enforced: rand() < 0.5 } };
		const plan = nextInnings(state);
		if (plan !== null) {
			const batting = Object.values(state.players).filter(
				(p) => p.teamId === plan.battingTeamId && p.role === "XI",
			);
			const keeper = state.keepers[plan.battingTeamId === a.teamId ? b.teamId : a.teamId];
			const bowlers = Object.values(state.players).filter(
				(p) => p.teamId !== plan.battingTeamId && p.role === "XI" && p.id !== keeper,
			);
			return {
				type: "INNINGS_STARTED",
				payload: {
					battingTeamId: plan.battingTeamId,
					strikerId: batting[0]!.id,
					nonStrikerId: batting[1]!.id,
					bowlerId: bowlers.at(-1)!.id,
				},
			};
		}
		const result = state.provisionalResult ?? {
			kind: state.rules?.inningsPerSide === 2 ? "DRAW" : "NO_RESULT",
		};
		return { type: "MATCH_RESULT", payload: { result, override: false } };
	}
	if (needsBatter(inn)) {
		const options = eligibleBatters(state, inn);
		return options.length === 0
			? { type: "INNINGS_ENDED", payload: { reason: "ALL_OUT" } }
			: { type: "BATTER_IN", payload: { batterId: options[0] } };
	}
	if (overDue(inn)) return { type: "END_OF_OVER", payload: { reason: "NORMAL" } };
	if (needsBowler(inn)) {
		const keeper = state.keepers[inn.bowlingTeamId];
		const eligible = eligibleBowlers(state, inn).filter((e) => e.eligible);
		// Five or six regular bowlers, as a captain would use.
		const regulars = eligible.filter((e) => e.playerId !== keeper).slice(-6);
		return {
			type: "BOWLER_CHANGE",
			payload: {
				bowlerId: pick(regulars.length > 0 ? regulars : eligible).playerId,
				reason: "NEW_OVER",
			},
		};
	}
	const r = rand();
	const striker = inn.strikerId!;
	if (r < 0.035 && !inn.freeHit) {
		const fielders = Object.values(state.players).filter(
			(p) => p.teamId === inn.bowlingTeamId && p.role === "XI",
		);
		const caught = rand() < 0.55;
		return {
			type: "DELIVERY",
			payload: ball({
				dismissal: {
					kind: caught ? "CAUGHT" : rand() < 0.6 ? "BOWLED" : "LBW",
					batterId: striker,
					fielderIds: caught ? [pick(fielders).id] : [],
					end: null,
					directHit: false,
				},
			}),
		};
	}
	if (r < 0.065) return { type: "DELIVERY", payload: ball({ extra: { kind: "WIDE" } }) };
	if (r < 0.075)
		return {
			type: "DELIVERY",
			payload: ball({ runs: rand() < 0.7 ? 0 : 1, extra: { kind: "NO_BALL", runsFrom: "BAT" } }),
		};
	if (r < 0.085)
		return { type: "DELIVERY", payload: ball({ runs: 1, extra: { kind: "LEG_BYE" } }) };
	if (r < 0.43) return { type: "DELIVERY", payload: ball() };
	if (r < 0.75) return { type: "DELIVERY", payload: ball({ runs: 1 }) };
	if (r < 0.84) return { type: "DELIVERY", payload: ball({ runs: 2 }) };
	if (r < 0.85) return { type: "DELIVERY", payload: ball({ runs: 3 }) };
	if (r < 0.95) return { type: "DELIVERY", payload: ball({ boundary: "FOUR" }) };
	return { type: "DELIVERY", payload: ball({ boundary: "SIX" }) };
}
