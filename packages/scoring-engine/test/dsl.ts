/**
 * A tiny scorebook DSL for tests:
 *   match("T20", { overs: 2 }).toss("A", "BAT").open("a1", "a2", "b1").balls("1 . 4! W")
 * Ball tokens: "." / "0" dot · "N" runs · "4!" / "6!" boundary · "Nwd" wide (+N run) · "4wd!" ·
 * "Nnb" no-ball + N bat runs · "4nb!" / "6nb!" · "Nnbb" / "Nnblb" no-ball byes/leg byes ·
 * "Nb" byes · "Nlb" leg byes · "4b!" · "4lb!" · "W" bowled · "N+Pp" penalty runs on the ball.
 */
import { expect } from "vitest";
import { PRESETS, type PresetId } from "../src/rules/presets";
import { appendEvent } from "../src/log/replay";
import { initialState } from "../src/reducer/apply";
import { RuleViolation } from "../src/errors";
import type { EngineOptions } from "../src/reducer/officials";
import type {
	DeliveryDismissal,
	DeliveryPayload,
	MatchEvent,
	PlayEvent,
	TeamSheet,
} from "../src/types/events";
import type { MatchRules } from "../src/types/rules";
import type { InningsState, MatchState } from "../src/types/state";

export function sheet(teamId: string, players: number, subs = 2): TeamSheet {
	const id = teamId.toLowerCase();
	return {
		teamId,
		name: `Team ${teamId}`,
		shortName: teamId,
		playingXI: Array.from({ length: players }, (_, i) => ({
			id: `${id}${i + 1}`,
			name: `${teamId}${i + 1}`,
		})),
		substitutes: Array.from({ length: subs }, (_, i) => ({
			id: `${id}s${i + 1}`,
			name: `${teamId}S${i + 1}`,
		})),
		captainId: `${id}1`,
		wicketKeeperId: `${id}${players}`,
	};
}

type EventOf<T extends PlayEvent["type"]> = Extract<PlayEvent, { type: T }>;

export const DOT: DeliveryPayload = {
	runs: 0,
	boundary: null,
	overthrow: false,
	extra: null,
	dismissal: null,
	penaltyRuns: 0,
	overMiscount: false,
	detail: null,
};

/** Parse one ball token into a payload (the dismissal for "W" is filled in by the builder). */
export function parseBall(token: string): DeliveryPayload & { bowled?: true } {
	const p: DeliveryPayload & { bowled?: true } = { ...DOT };
	let t = token;
	const pen = /\+(\d+)p$/.exec(t);
	if (pen !== null) {
		p.penaltyRuns = Number(pen[1]);
		t = t.slice(0, pen.index);
	}
	if (t === "W") return { ...p, bowled: true };
	if (t === "." || t === "0") return p;
	const boundary = t.endsWith("!");
	if (boundary) t = t.slice(0, -1);
	const m = /^(\d*)(wd|nbb|nblb|nb|b|lb)?$/.exec(t);
	if (m === null) throw new Error(`Bad ball token: ${token}`);
	const n = m[1] === "" ? 0 : Number(m[1]);
	const kind = m[2];
	if (boundary) {
		p.boundary = n === 6 ? "SIX" : "FOUR";
		p.runs = 0;
	} else {
		p.runs = n;
	}
	switch (kind) {
		case "wd":
			p.extra = { kind: "WIDE" };
			break;
		case "nb":
			p.extra = { kind: "NO_BALL", runsFrom: "BAT" };
			break;
		case "nbb":
			p.extra = { kind: "NO_BALL", runsFrom: "BYE" };
			break;
		case "nblb":
			p.extra = { kind: "NO_BALL", runsFrom: "LEG_BYE" };
			break;
		case "b":
			p.extra = { kind: "BYE" };
			break;
		case "lb":
			p.extra = { kind: "LEG_BYE" };
			break;
	}
	return p;
}

export interface MatchOptions {
	overs?: number | null;
	players?: number;
	rules?: Partial<MatchRules>;
	engine?: EngineOptions;
}

let idCounter = 0;

export class Scorebook {
	log: MatchEvent[] = [];
	state: MatchState = initialState();
	readonly options: EngineOptions;

	constructor(options: EngineOptions = {}) {
		this.options = options;
	}

	get seq(): number {
		return this.log.length + 1;
	}

	/** Current or most recent innings. */
	get inn(): InningsState {
		const inn = this.state.innings[this.state.innings.length - 1];
		if (inn === undefined) throw new Error("no innings");
		return inn;
	}

	innings(i: number): InningsState {
		const inn = this.state.innings[i];
		if (inn === undefined) throw new Error(`no innings ${i}`);
		return inn;
	}

	build<T extends PlayEvent["type"]>(type: T, payload: EventOf<T>["payload"]): EventOf<T> {
		return { id: `e${++idCounter}`, seq: this.seq, type, payload } as EventOf<T>;
	}

	push(event: MatchEvent): this {
		const { log, state } = appendEvent(this.log, this.state, event, this.options);
		this.log = log;
		this.state = state;
		return this;
	}

	event<T extends PlayEvent["type"]>(type: T, payload: EventOf<T>["payload"]): this {
		return this.push(this.build(type, payload));
	}

	/** Assert that an event is rejected with `code` and leaves the state untouched. */
	rejects<T extends PlayEvent["type"]>(
		type: T,
		payload: EventOf<T>["payload"],
		code: string,
	): this {
		const before = JSON.stringify(this.state);
		let error: unknown = null;
		try {
			this.event(type, payload);
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(RuleViolation);
		expect((error as RuleViolation).code).toBe(code);
		expect(JSON.stringify(this.state)).toBe(before);
		return this;
	}

	rejectsBall(token: string | Partial<DeliveryPayload>, code: string): this {
		return this.rejects("DELIVERY", this.payloadFor(token), code);
	}

	start(rules: MatchRules, a: TeamSheet, b: TeamSheet): this {
		return this.event("MATCH_STARTED", { rules, teams: [a, b] });
	}

	toss(winner: string, decision: "BAT" | "BOWL"): this {
		return this.event("TOSS", { winnerTeamId: winner, decision });
	}

	open(strikerId: string, nonStrikerId: string, bowlerId: string): this {
		const battingTeamId = strikerId.replace(/\d.*$/, "").replace(/s$/, "").toUpperCase();
		return this.event("INNINGS_STARTED", { battingTeamId, strikerId, nonStrikerId, bowlerId });
	}

	payloadFor(token: string | Partial<DeliveryPayload>): DeliveryPayload {
		if (typeof token !== "string") return { ...DOT, ...token };
		const { bowled, ...p } = parseBall(token);
		if (bowled === true) {
			p.dismissal = this.dismissal("BOWLED");
		}
		return p;
	}

	dismissal(
		kind: DeliveryDismissal["kind"],
		opts: Partial<DeliveryDismissal> = {},
	): DeliveryDismissal {
		return {
			kind,
			batterId: opts.batterId ?? this.inn.strikerId ?? "",
			fielderIds: opts.fielderIds ?? [],
			end: opts.end ?? null,
			directHit: opts.directHit ?? false,
		};
	}

	ball(token: string | Partial<DeliveryPayload>): this {
		return this.event("DELIVERY", this.payloadFor(token));
	}

	balls(tokens: string): this {
		for (const t of tokens.split(/\s+/).filter((s) => s !== "")) this.ball(t);
		return this;
	}

	/** A dismissal on a delivery. */
	out(
		kind: DeliveryDismissal["kind"],
		opts: Partial<DeliveryDismissal> & { ball?: string } = {},
	): this {
		const p = this.payloadFor(opts.ball ?? ".");
		p.dismissal = this.dismissal(kind, opts);
		return this.event("DELIVERY", p);
	}

	in(batterId: string): this {
		return this.event("BATTER_IN", { batterId });
	}

	bowler(
		bowlerId: string,
		reason: "NEW_OVER" | "INJURY" | "SUSPENDED" | "OTHER" = "NEW_OVER",
	): this {
		return this.event("BOWLER_CHANGE", { bowlerId, reason });
	}

	endOver(reason: "NORMAL" | "MISCOUNT" = "NORMAL"): this {
		return this.event("END_OF_OVER", { reason });
	}

	/** END_OF_OVER (if an over is due) + new bowler + balls. */
	over(bowlerId: string, tokens: string): this {
		if (this.inn.currentOver !== null) this.endOver();
		return this.bowler(bowlerId).balls(tokens);
	}

	undo(targetId?: string): this {
		const last = this.lastEffectiveId();
		return this.push({
			id: `e${++idCounter}`,
			seq: this.seq,
			type: "UNDO",
			payload: { targetId: targetId ?? last },
		});
	}

	correct(targetId: string, patch: Record<string, unknown>): this {
		return this.push({
			id: `e${++idCounter}`,
			seq: this.seq,
			type: "CORRECTION",
			payload: { targetId, patch },
		});
	}

	lastEffectiveId(): string {
		const undone = new Set<string>();
		for (let i = this.log.length - 1; i >= 0; i--) {
			const e = this.log[i]!;
			if (undone.has(e.id)) continue;
			if (e.type === "UNDO") {
				undone.add(e.payload.targetId);
				continue;
			}
			return e.id;
		}
		throw new Error("empty log");
	}

	result(): this {
		const r = this.state.provisionalResult;
		if (r === null) throw new Error("no provisional result");
		return this.event("MATCH_RESULT", { result: r, override: false });
	}
}

export function match(preset: PresetId, opts: MatchOptions = {}): Scorebook {
	const base = PRESETS[preset];
	const players = opts.players ?? base.playersPerSide;
	const rules: MatchRules = {
		...base,
		playersPerSide: players,
		...(opts.overs === undefined ? {} : { oversPerInnings: opts.overs }),
		...opts.rules,
	};
	return new Scorebook(opts.engine).start(rules, sheet("A", players), sheet("B", players));
}

/** Common opener: A bats, a1/a2 open, b1 bowls. */
export function started(preset: PresetId = "T20", opts: MatchOptions = {}): Scorebook {
	return match(preset, opts).toss("A", "BAT").open("a1", "a2", "b1");
}
