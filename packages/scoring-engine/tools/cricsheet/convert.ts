/**
 * Dev-only converter: Cricsheet JSON (https://cricsheet.org, ODC-By 1.0) → engine event log
 * (ADR-0012). It drives the engine as it goes, so every emitted event is valid, and reconciles
 * batting positions against Cricsheet's next ball (Cricsheet does not record run-out ends or
 * crossings) with SWAP_STRIKE / BATTER_IN.
 *
 * Known approximations (documented in docs/CRICKET_RULES.md, golden tests):
 * - Revised targets are applied before the chase starts, as officials' overrides (Cricsheet does
 *   not record when play stopped).
 * - Keepers/captains are not in Cricsheet; the keeper is whoever made a stumping, else the first
 *   listed player; the captain is the first listed player.
 */
import { appendEvent } from "../../src/log/replay";
import { initialState } from "../../src/reducer/apply";
import { currentInnings, eligibleBatters, overDue } from "../../src/reducer/context";
import { PRESETS } from "../../src/rules/presets";
import type {
	DeliveryDismissalKind,
	DeliveryPayload,
	MatchEvent,
	PlayEvent,
	TeamSheet,
} from "../../src/types/events";
import type { MatchRules } from "../../src/types/rules";
import type { MatchState } from "../../src/types/state";

export interface CricsheetDelivery {
	batter: string;
	bowler: string;
	non_striker: string;
	runs: { batter: number; extras: number; total: number; non_boundary?: boolean };
	extras?: { wides?: number; noballs?: number; byes?: number; legbyes?: number; penalty?: number };
	wickets?: {
		player_out: string;
		kind: string;
		fielders?: { name: string; substitute?: boolean }[];
	}[];
	replacements?: {
		match?: { in: string; out: string; reason: string; team: string }[];
		role?: { in: string; out?: string; reason: string; role: string }[];
	};
}

export interface CricsheetMatch {
	info: {
		balls_per_over: number;
		match_type: string;
		event?: { name?: string };
		teams: [string, string];
		players: Record<string, string[]>;
		registry: { people: Record<string, string> };
		toss: { winner: string; decision: "bat" | "field" };
		outcome: { winner?: string; result?: string; eliminator?: string; method?: string };
	};
	innings: {
		team: string;
		overs: { over: number; deliveries: CricsheetDelivery[] }[];
		declared?: boolean;
		super_over?: boolean;
		target?: { overs?: number; runs?: number };
		penalty_runs?: { pre?: number; post?: number };
	}[];
}

export interface ConvertOptions {
	/** Override rules fields (e.g. tie-breaker for a given competition). */
	rules?: Partial<MatchRules>;
}

const DISMISSAL: Record<string, DeliveryDismissalKind> = {
	bowled: "BOWLED",
	caught: "CAUGHT",
	"caught and bowled": "CAUGHT",
	lbw: "LBW",
	"run out": "RUN_OUT",
	stumped: "STUMPED",
	"hit wicket": "HIT_WICKET",
	"obstructing the field": "OBSTRUCTING_THE_FIELD",
	"hit the ball twice": "HIT_BALL_TWICE",
	"handled the ball": "HANDLED_THE_BALL",
};

function rulesFor(m: CricsheetMatch, overrides: Partial<MatchRules>): MatchRules {
	const i = m.info;
	const hundred = i.balls_per_over === 5 || /hundred/i.test(i.event?.name ?? "");
	const base = hundred
		? PRESETS.HUNDRED
		: i.match_type === "Test"
			? PRESETS.TEST
			: i.match_type === "ODI"
				? PRESETS.ODI
				: PRESETS.T20;
	// Historical matches: allow the officials' targets as given, no table needed.
	return {
		...base,
		targetRevision: base.inningsPerSide === 2 ? "MANUAL" : base.targetRevision,
		...overrides,
	};
}

export function convertCricsheet(m: CricsheetMatch, options: ConvertOptions = {}): MatchEvent[] {
	const i = m.info;
	const pid = (name: string): string => i.registry.people[name] ?? name;
	const rules = rulesFor(m, options.rules ?? {});

	// Squads: playing XI = listed players minus concussion/impact replacements (who start as subs).
	const replacementsIn = new Set<string>();
	const stumpers = new Map<string, string>();
	const subFielders = new Map<string, Set<string>>();
	for (const inn of m.innings) {
		const fieldingTeam = i.teams[0] === inn.team ? i.teams[1] : i.teams[0];
		for (const o of inn.overs) {
			for (const d of o.deliveries) {
				for (const r of d.replacements?.match ?? []) replacementsIn.add(r.in);
				for (const w of d.wickets ?? []) {
					if (w.kind === "stumped" && w.fielders?.[0] !== undefined)
						stumpers.set(fieldingTeam, w.fielders[0].name);
					for (const f of w.fielders ?? []) {
						if (f.substitute === true) {
							const set = subFielders.get(fieldingTeam) ?? new Set<string>();
							set.add(f.name);
							subFielders.set(fieldingTeam, set);
						}
					}
				}
			}
		}
	}
	const sheet = (team: string, index: number): TeamSheet => {
		const listed = i.players[team] ?? [];
		const xi = listed.filter((p) => !replacementsIn.has(p));
		const subs = [
			...listed.filter((p) => replacementsIn.has(p)),
			...(subFielders.get(team) ?? []),
		].filter((p, k, all) => all.indexOf(p) === k && !xi.includes(p));
		const first = xi[0] ?? "";
		return {
			teamId: `T${index + 1}`,
			name: team,
			shortName: team.slice(0, 3).toUpperCase(),
			playingXI: xi.map((p) => ({ id: pid(p), name: p })),
			substitutes: subs.map((p) => ({ id: pid(p), name: p })),
			captainId: pid(first),
			wicketKeeperId: pid(stumpers.get(team) ?? first),
		};
	};
	const teams: [TeamSheet, TeamSheet] = [sheet(i.teams[0], 0), sheet(i.teams[1], 1)];
	const teamId = (name: string): string => (name === i.teams[0] ? "T1" : "T2");
	const playersPerSide = teams[0].playingXI.length;

	let log: MatchEvent[] = [];
	let state: MatchState = initialState();
	let n = 0;
	const emit = <T extends PlayEvent["type"]>(
		type: T,
		payload: Extract<PlayEvent, { type: T }>["payload"],
	): void => {
		const event = { id: `cs${++n}`, seq: log.length + 1, type, payload } as MatchEvent;
		({ log, state } = appendEvent(log, state, event));
	};

	emit("MATCH_STARTED", { rules: { ...rules, playersPerSide }, teams });
	emit("TOSS", {
		winnerTeamId: teamId(i.toss.winner),
		decision: i.toss.decision === "bat" ? "BAT" : "BOWL",
	});

	let superOverInnings = 0;
	for (const inn of m.innings) {
		const first = inn.overs[0]?.deliveries[0];
		if (first === undefined) continue;
		// A super-over round has two innings; announce it before the first.
		if (inn.super_over === true) {
			if (superOverInnings % 2 === 0)
				emit("SUPER_OVER_STARTED", { round: superOverInnings / 2 + 1 });
			superOverInnings++;
		}
		const target = inn.target;
		const normalOvers = rules.oversPerInnings;
		if (inn.super_over !== true && target?.runs !== undefined && rules.inningsPerSide === 1) {
			const expected = (state.innings[0]?.runs ?? 0) + 1;
			if (
				target.runs !== expected ||
				(target.overs !== undefined && target.overs !== normalOvers)
			) {
				emit("TARGET_REVISED", {
					target: target.runs,
					overs: target.overs ?? normalOvers ?? 0,
					override: true,
				});
			}
		}
		if ((inn.penalty_runs?.pre ?? 0) > 0) {
			emit("PENALTY_RUNS", {
				toTeamId: teamId(inn.team),
				runs: inn.penalty_runs!.pre!,
				reason: "cricsheet: pre",
			});
		}
		emit("INNINGS_STARTED", {
			battingTeamId: teamId(inn.team),
			strikerId: pid(first.batter),
			nonStrikerId: pid(first.non_striker),
			bowlerId: pid(first.bowler),
		});

		let firstOver = true;
		for (const o of inn.overs) {
			const cur = (): ReturnType<typeof currentInnings> => currentInnings(state);
			if (!firstOver) {
				const c = cur();
				if (c?.currentOver !== null && c !== null) {
					const short = c.currentOver.legalBalls < c.ballsPerOver;
					emit("END_OF_OVER", { reason: short ? "MISCOUNT" : "NORMAL" });
				}
				const d0 = o.deliveries[0]!;
				syncBatters(d0);
				if (cur()?.currentOver === null)
					emit("BOWLER_CHANGE", { bowlerId: pid(d0.bowler), reason: "NEW_OVER" });
			}
			firstOver = false;
			for (const d of o.deliveries) {
				// Concussion / impact substitutions happen before the ball they are attached to.
				for (const r of d.replacements?.match ?? []) {
					emit("SUBSTITUTION", {
						kind: /concussion/.test(r.reason) ? "CONCUSSION" : "IMPACT",
						teamId: teamId(r.team),
						outPlayerId: pid(r.out),
						inPlayerId: pid(r.in),
					});
				}
				// A batter retiring hurt shows up as a role replacement.
				for (const r of d.replacements?.role ?? []) {
					if (r.role === "batter" && r.out !== undefined && /injury|retired/.test(r.reason)) {
						const c = cur();
						if (c !== null && (c.strikerId === pid(r.out) || c.nonStrikerId === pid(r.out))) {
							emit("RETIREMENT", { batterId: pid(r.out), kind: "HURT" });
						}
					}
				}
				const c = cur();
				if (c === null) throw new Error(`No innings in progress at ${inn.team} over ${o.over}`);
				const lastBowler = c.currentOver?.bowlerIds.at(-1) ?? null;
				if (c.currentOver !== null && lastBowler !== pid(d.bowler)) {
					emit("BOWLER_CHANGE", { bowlerId: pid(d.bowler), reason: "INJURY" });
				}
				syncBatters(d);
				emitDelivery(d);
			}
		}
		if (inn.declared === true && currentInnings(state) !== null) {
			emit("DECLARATION", { teamId: teamId(inn.team) });
		}
		if ((inn.penalty_runs?.post ?? 0) > 0) {
			emit("PENALTY_RUNS", {
				toTeamId: teamId(inn.team),
				runs: inn.penalty_runs!.post!,
				reason: "cricsheet: post",
			});
		}
		const open = currentInnings(state);
		if (
			open !== null &&
			rules.inningsPerSide === 2 &&
			m.innings.indexOf(inn) < m.innings.length - 1
		) {
			throw new Error(`Innings of ${inn.team} did not close`);
		}
	}

	if (state.provisionalResult !== null) {
		emit("MATCH_RESULT", { result: state.provisionalResult, override: false });
	} else if (i.outcome.result === "draw") {
		emit("MATCH_RESULT", { result: { kind: "DRAW" }, override: false });
	} else if (i.outcome.result === "no result") {
		emit("MATCH_RESULT", { result: { kind: "NO_RESULT" }, override: false });
	}
	return log;

	/** Make the engine's batters match Cricsheet's for this ball. */
	function syncBatters(d: CricsheetDelivery): void {
		const want = [pid(d.batter), pid(d.non_striker)];
		for (let guard = 0; guard < 3; guard++) {
			const c = currentInnings(state);
			if (c === null) return;
			const missing = want.filter((p) => p !== c.strikerId && p !== c.nonStrikerId);
			if (missing.length === 0) break;
			if (c.strikerId !== null && c.nonStrikerId !== null) {
				throw new Error(
					`Batters ${c.strikerId}/${c.nonStrikerId} at crease, Cricsheet has ${want.join("/")}`,
				);
			}
			const next = missing[0]!;
			if (!eligibleBatters(state, c).includes(next))
				throw new Error(`${next} is not eligible to bat`);
			emit("BATTER_IN", { batterId: next });
		}
		const c = currentInnings(state);
		if (c !== null && c.strikerId !== want[0])
			emit("SWAP_STRIKE", { reason: "cricsheet: batters' positions" });
	}

	function emitDelivery(d: CricsheetDelivery): void {
		const x = d.extras ?? {};
		const p: DeliveryPayload = {
			runs: 0,
			boundary: null,
			overthrow: false,
			extra: null,
			dismissal: null,
			penaltyRuns: x.penalty ?? 0,
			overMiscount: false,
			detail: null,
		};
		const boundaryOf = (r: number): "FOUR" | "SIX" | null =>
			d.runs.non_boundary === true ? null : r === 4 ? "FOUR" : r === 6 ? "SIX" : null;
		const set = (r: number, boundary: "FOUR" | "SIX" | null): void => {
			p.boundary = boundary;
			p.runs = boundary === null ? r : 0;
		};
		if (x.wides !== undefined) {
			p.extra = { kind: "WIDE" };
			const ran = x.wides - rules.wideRuns;
			set(ran, ran === 4 ? boundaryOf(4) : null);
		} else if (x.noballs !== undefined) {
			if (x.byes !== undefined || x.legbyes !== undefined) {
				const r = x.byes ?? x.legbyes ?? 0;
				p.extra = { kind: "NO_BALL", runsFrom: x.byes !== undefined ? "BYE" : "LEG_BYE" };
				set(r, r === 4 ? boundaryOf(4) : null);
			} else {
				p.extra = { kind: "NO_BALL", runsFrom: "BAT" };
				set(d.runs.batter, boundaryOf(d.runs.batter));
			}
		} else if (x.byes !== undefined || x.legbyes !== undefined) {
			const r = x.byes ?? x.legbyes ?? 0;
			p.extra = { kind: x.byes !== undefined ? "BYE" : "LEG_BYE" };
			set(r, r === 4 ? boundaryOf(4) : null);
		} else {
			set(d.runs.batter, boundaryOf(d.runs.batter));
		}

		const retirements: { batterId: string; kind: "HURT" | "OUT" }[] = [];
		for (const w of d.wickets ?? []) {
			if (/retired/.test(w.kind)) {
				retirements.push({
					batterId: pid(w.player_out),
					kind: w.kind === "retired out" ? "OUT" : "HURT",
				});
				continue;
			}
			const kind = DISMISSAL[w.kind];
			if (kind === undefined) throw new Error(`Unsupported dismissal: ${w.kind}`);
			const fielders = (w.fielders ?? []).map((f) => pid(f.name));
			p.dismissal = {
				kind,
				batterId: pid(w.player_out),
				fielderIds:
					w.kind === "caught and bowled" ? [pid(d.bowler)] : kind === "STUMPED" ? [] : fielders,
				end: null,
				directHit: false,
			};
		}
		const c = currentInnings(state);
		if (c !== null && overDue(c)) p.overMiscount = true;
		emit("DELIVERY", p);
		for (const r of retirements) {
			const now = currentInnings(state);
			if (now !== null && (now.strikerId === r.batterId || now.nonStrikerId === r.batterId))
				emit("RETIREMENT", r);
		}
	}
}
