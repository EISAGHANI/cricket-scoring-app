/**
 * Golden tests: five real matches from Cricsheet (ODC-By 1.0, see cricsheet/ATTRIBUTION.md),
 * converted to event logs and replayed. Each scorecard is checked against an oracle computed
 * independently from Cricsheet's raw deliveries, plus hand-checked published figures.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { format, replay } from "../../src";
import type { MatchState } from "../../src/types/state";
import type { MatchRules } from "../../src/types/rules";
import { convertCricsheet, type CricsheetMatch } from "../../tools/cricsheet/convert";

function load(id: string): CricsheetMatch {
	return JSON.parse(
		readFileSync(new URL(`./cricsheet/${id}.json`, import.meta.url), "utf8"),
	) as CricsheetMatch;
}

const CREDITED = new Set(["bowled", "caught", "caught and bowled", "lbw", "stumped", "hit wicket"]);

interface Oracle {
	runs: number;
	wickets: number;
	batters: Map<string, { runs: number; balls: number }>;
	bowlers: Map<string, { runs: number; wickets: number }>;
}

/** Scorecard figures computed directly from Cricsheet deliveries (no engine involved). */
function oracle(m: CricsheetMatch): Oracle[] {
	return m.innings.map((inn) => {
		const o: Oracle = { runs: 0, wickets: 0, batters: new Map(), bowlers: new Map() };
		for (const p of inn.penalty_runs ? [inn.penalty_runs.pre ?? 0, inn.penalty_runs.post ?? 0] : [])
			o.runs += p;
		for (const over of inn.overs) {
			for (const d of over.deliveries) {
				const x = d.extras ?? {};
				o.runs += d.runs.total;
				const bat = o.batters.get(d.batter) ?? { runs: 0, balls: 0 };
				bat.runs += d.runs.batter;
				if (x.wides === undefined) bat.balls++;
				o.batters.set(d.batter, bat);
				const bowl = o.bowlers.get(d.bowler) ?? { runs: 0, wickets: 0 };
				bowl.runs += d.runs.batter + (x.wides ?? 0) + (x.noballs ?? 0);
				for (const w of d.wickets ?? []) {
					if (w.kind !== "retired hurt" && w.kind !== "retired not out") o.wickets++;
					if (CREDITED.has(w.kind)) bowl.wickets++;
				}
				o.bowlers.set(d.bowler, bowl);
			}
		}
		return o;
	});
}

function play(id: string, rules: Partial<MatchRules> = {}): { m: CricsheetMatch; s: MatchState } {
	const m = load(id);
	return { m, s: replay(convertCricsheet(m, { rules })) };
}

function name(s: MatchState, id: string): string {
	return format.playerName(s, id);
}

function expectMatchesOracle(m: CricsheetMatch, s: MatchState): void {
	const expected = oracle(m);
	expect(s.innings).toHaveLength(expected.length);
	s.innings.forEach((inn, k) => {
		const o = expected[k]!;
		expect({ innings: k, runs: inn.runs, wickets: inn.wickets }).toEqual({
			innings: k,
			runs: o.runs,
			wickets: o.wickets,
		});
		const batters = Object.fromEntries(
			inn.batters
				.filter((b) => o.batters.has(name(s, b.playerId)))
				.map((b) => [name(s, b.playerId), { runs: b.runs, balls: b.balls }]),
		);
		expect(batters).toEqual(Object.fromEntries(o.batters));
		const bowlers = Object.fromEntries(
			inn.bowlers.map((b) => [name(s, b.playerId), { runs: b.runs, wickets: b.wickets }]),
		);
		expect(bowlers).toEqual(Object.fromEntries(o.bowlers));
	});
}

const batter = (s: MatchState, inn: number, who: string) =>
	s.innings[inn]!.batters.find((b) => name(s, b.playerId) === who)!;
const bowler = (s: MatchState, inn: number, who: string) =>
	s.innings[inn]!.bowlers.find((b) => name(s, b.playerId) === who)!;

describe("golden matches", () => {
	it("2019 World Cup final, Lord's: tie, tied super over, England win on boundary count", () => {
		const { m, s } = play("1144530", { tieBreaker: "SUPER_OVER_THEN_BOUNDARY_COUNT" });
		expectMatchesOracle(m, s);
		expect(s.innings.map((i) => `${i.runs}/${i.wickets}`)).toEqual([
			"241/8",
			"241/10",
			"15/0",
			"15/1",
		]);
		expect(batter(s, 1, "BA Stokes")).toMatchObject({ runs: 84, balls: 98, status: "NOT_OUT" });
		// The overthrow off Stokes' bat: 2 run + 4 = 6, not a boundary.
		expect(batter(s, 1, "BA Stokes")).toMatchObject({ fours: 5, sixes: 2 });
		const count = (team: string) =>
			s.innings
				.filter((i) => format.teamName(s, i.battingTeamId) === team)
				.reduce((n, i) => n + i.boundaries, 0);
		expect([count("England"), count("New Zealand")]).toEqual([26, 17]);
		expect(format.resultText(s, s.result!)).toBe("England won (boundary count)");
	});

	it("2019 Ashes, Headingley: England chase 359 to win by one wicket", () => {
		const { m, s } = play("1152848");
		expectMatchesOracle(m, s);
		expect(s.innings.map((i) => `${i.runs}/${i.wickets}`)).toEqual([
			"179/10",
			"67/10",
			"246/10",
			"362/9",
		]);
		expect(bowler(s, 0, "JC Archer")).toMatchObject({ runs: 45, wickets: 6 });
		expect(bowler(s, 1, "JR Hazlewood")).toMatchObject({ runs: 30, wickets: 5 });
		expect(batter(s, 3, "BA Stokes")).toMatchObject({ runs: 135, balls: 219, status: "NOT_OUT" });
		expect(s.innings[3]!.target).toBe(359);
		expect(format.resultText(s, s.result!)).toBe("England won by 1 wicket");
	});

	it("2019 World Cup, India v Pakistan: rain-revised target (302 from 40 overs)", () => {
		const { m, s } = play("1144504");
		expectMatchesOracle(m, s);
		expect(batter(s, 0, "RG Sharma")).toMatchObject({ runs: 140, balls: 113 });
		expect(s.innings[1]).toMatchObject({
			target: 302,
			maxOvers: 40,
			runs: 212,
			wickets: 6,
			targetRevised: true,
		});
		expect(format.resultText(s, s.result!)).toBe("India won by 89 runs (DLS_STANDARD method)");
	});

	it("2019 Ashes, Lord's: Smith retired hurt and returned; first concussion substitute; draw", () => {
		const { m, s } = play("1152847");
		expectMatchesOracle(m, s);
		expect(
			s.innings.map((i) => `${i.runs}/${i.wickets}${i.closeReason === "DECLARED" ? "d" : ""}`),
		).toEqual(["258/10", "250/10", "258/5d", "154/6"]);
		expect(batter(s, 1, "SPD Smith")).toMatchObject({ runs: 92, status: "OUT" });
		expect(batter(s, 2, "BA Stokes")).toMatchObject({ runs: 115, status: "NOT_OUT" });
		const labuschagne = Object.values(s.players).find((p) => p.name === "M Labuschagne")!;
		expect(labuschagne).toMatchObject({ role: "XI", substitutionKind: "CONCUSSION" });
		expect(batter(s, 3, "M Labuschagne").runs).toBe(59);
		expect(s.result).toEqual({ kind: "DRAW" });
	});

	it("The Hundred 2021, opening men's match: 5-ball sets, 2-run no-balls", () => {
		const { m, s } = play("1252666");
		expectMatchesOracle(m, s);
		expect(s.innings.map((i) => format.formatOvers(s, i))).toEqual(["100 balls", "100 balls"]);
		expect(format.resultText(s, s.result!)).toBe("Oval Invincibles won by 9 runs");
	});

	it("converted logs replay deterministically", () => {
		const m = load("1252666");
		const log = convertCricsheet(m);
		expect(replay(log)).toEqual(replay(convertCricsheet(m)));
	});
});
