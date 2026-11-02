import type {
	BallEvent,
	DismissalKind,
	ExtraKind,
	Id,
	Match,
	MatchEvent,
	TeamIndex,
	Wicket,
} from "./types";

/* ------------------------------------------------------------------ */
/* Derived state                                                       */
/* ------------------------------------------------------------------ */

export interface BatterLine {
	playerId: Id;
	/** 1-based batting position. */
	order: number;
	runs: number;
	balls: number;
	fours: number;
	sixes: number;
	dismissal: (Wicket & { bowlerId: Id }) | null;
}

export interface BowlerLine {
	playerId: Id;
	legalBalls: number;
	runs: number;
	wickets: number;
	maidens: number;
	wides: number;
	noBalls: number;
	dots: number;
}

export type BallTone = "dot" | "run" | "four" | "six" | "extra" | "wicket";

export interface BallRecord {
	label: string;
	tone: BallTone;
	legal: boolean;
}

export interface OverRecord {
	/** 1-based over number. */
	number: number;
	bowlerId: Id;
	balls: BallRecord[];
	/** All runs scored in the over, including byes. */
	runs: number;
	/** Runs charged to the bowler (used for maidens). */
	bowlerRuns: number;
	wickets: number;
	legalBalls: number;
}

export interface FallOfWicket {
	wicket: number;
	runs: number;
	legalBalls: number;
	playerId: Id;
}

export type CloseReason = "allOut" | "overs" | "target" | "declared";

export interface InningsState {
	number: 1 | 2;
	battingTeam: TeamIndex;
	bowlingTeam: TeamIndex;
	runs: number;
	wickets: number;
	legalBalls: number;
	extras: { wides: number; noBalls: number; byes: number; legByes: number };
	batters: BatterLine[];
	bowlers: BowlerLine[];
	fallOfWickets: FallOfWicket[];
	overs: OverRecord[];
	strikerId: Id | null;
	nonStrikerId: Id | null;
	bowlerId: Id | null;
	/** Bowler of the last completed over; may not bowl the next one. */
	previousOverBowlerId: Id | null;
	freeHit: boolean;
	partnership: { runs: number; balls: number };
	closed: CloseReason | null;
}

export type Pending =
	{ kind: "openers"; innings: 1 | 2 } | { kind: "newBatter" } | { kind: "newBowler" } | null;

export interface MatchResult {
	winner: TeamIndex | null;
	by: "runs" | "wickets" | "tie";
	margin: number;
	text: string;
}

export interface MatchState {
	innings: InningsState[];
	current: InningsState | null;
	/** Runs the side batting second needs, once the first innings is closed. */
	target: number | null;
	ballsPerInnings: number;
	pending: Pending;
	result: MatchResult | null;
}

export class ScoringError extends Error {}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

const BOWLER_CREDITED: ReadonlySet<DismissalKind> = new Set([
	"bowled",
	"caught",
	"lbw",
	"stumped",
	"hitWicket",
]);

export function isBowlerCredited(kind: DismissalKind) {
	return BOWLER_CREDITED.has(kind);
}

/** Dismissals possible on a given delivery type (free hit: run out only). */
export function allowedDismissals(extra: ExtraKind | undefined, freeHit: boolean): DismissalKind[] {
	if (freeHit) return ["runOut"];
	switch (extra) {
		case "wide":
			return ["stumped", "runOut"];
		case "noBall":
		case "bye":
		case "legBye":
			return ["runOut"];
		default:
			return ["bowled", "caught", "lbw", "runOut", "stumped", "hitWicket"];
	}
}

/** Most wickets a side can lose: one batter is always left not out. */
export function maxWickets(match: Match, team: TeamIndex) {
	return Math.max(1, match.teams[team].players.length - 1);
}

/* ------------------------------------------------------------------ */
/* Replay                                                              */
/* ------------------------------------------------------------------ */

function newInnings(
	match: Match,
	number: 1 | 2,
	e: Extract<MatchEvent, { type: "startInnings" }>,
): InningsState {
	const battingTeam: TeamIndex =
		number === 1 ? match.battingFirst : ((1 - match.battingFirst) as TeamIndex);
	const bowlingTeam = (1 - battingTeam) as TeamIndex;
	const bat = new Set(match.teams[battingTeam].players.map((p) => p.id));
	const bowl = new Set(match.teams[bowlingTeam].players.map((p) => p.id));
	if (!bat.has(e.strikerId) || !bat.has(e.nonStrikerId))
		throw new ScoringError("Openers must be from the batting side.");
	if (e.strikerId === e.nonStrikerId) throw new ScoringError("Pick two different opening batters.");
	if (!bowl.has(e.bowlerId)) throw new ScoringError("The bowler must be from the fielding side.");

	return {
		number,
		battingTeam,
		bowlingTeam,
		runs: 0,
		wickets: 0,
		legalBalls: 0,
		extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
		batters: [batterLine(e.strikerId, 1), batterLine(e.nonStrikerId, 2)],
		bowlers: [bowlerLine(e.bowlerId)],
		fallOfWickets: [],
		overs: [],
		strikerId: e.strikerId,
		nonStrikerId: e.nonStrikerId,
		bowlerId: e.bowlerId,
		previousOverBowlerId: null,
		freeHit: false,
		partnership: { runs: 0, balls: 0 },
		closed: null,
	};
}

function batterLine(playerId: Id, order: number): BatterLine {
	return { playerId, order, runs: 0, balls: 0, fours: 0, sixes: 0, dismissal: null };
}

function bowlerLine(playerId: Id): BowlerLine {
	return {
		playerId,
		legalBalls: 0,
		runs: 0,
		wickets: 0,
		maidens: 0,
		wides: 0,
		noBalls: 0,
		dots: 0,
	};
}

function getBowler(inn: InningsState, id: Id) {
	let line = inn.bowlers.find((b) => b.playerId === id);
	if (!line) {
		line = bowlerLine(id);
		inn.bowlers.push(line);
	}
	return line;
}

function isWholeNumber(n: unknown, max: number): n is number {
	return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;
}

function ballLabel(e: BallEvent, total: number): BallRecord {
	const legal = e.extra !== "wide" && e.extra !== "noBall";
	if (e.wicket) return { label: total ? `${total}W` : "W", tone: "wicket", legal };
	switch (e.extra) {
		case "wide":
			return { label: total === 1 ? "Wd" : `${total}Wd`, tone: "extra", legal };
		case "noBall":
			return { label: total === 1 ? "Nb" : `${total}Nb`, tone: "extra", legal };
		case "bye":
			return { label: `${e.extraRuns}B`, tone: "extra", legal };
		case "legBye":
			return { label: `${e.extraRuns}Lb`, tone: "extra", legal };
		default:
			if (e.runs === 0) return { label: "0", tone: "dot", legal };
			if (e.runs === 4) return { label: "4", tone: "four", legal };
			if (e.runs === 6) return { label: "6", tone: "six", legal };
			return { label: String(e.runs), tone: "run", legal };
	}
}

function applyBall(
	match: Match,
	inn: InningsState,
	e: BallEvent,
	target: number | null,
	ballsPerInnings: number,
) {
	if (inn.closed) throw new ScoringError("This innings is over.");
	if (!inn.strikerId || !inn.nonStrikerId) throw new ScoringError("Select the new batter first.");
	if (!inn.bowlerId) throw new ScoringError("Select the bowler for this over.");

	const runs = e.runs ?? 0;
	const extraRuns = e.extraRuns ?? 0;
	if (!isWholeNumber(runs, 7) || !isWholeNumber(extraRuns, 7))
		throw new ScoringError("Runs must be between 0 and 7.");
	if ((e.extra === "wide" || e.extra === "bye" || e.extra === "legBye") && runs !== 0)
		throw new ScoringError("No runs off the bat on a wide, bye or leg bye.");
	if ((!e.extra || e.extra === "noBall") && extraRuns !== 0)
		throw new ScoringError("Extra runs only apply to wides, byes and leg byes.");
	if ((e.extra === "bye" || e.extra === "legBye") && extraRuns === 0 && !e.wicket)
		throw new ScoringError("Byes need at least one run.");

	if (e.wicket) {
		const w = e.wicket;
		if (!allowedDismissals(e.extra, inn.freeHit).includes(w.kind))
			throw new ScoringError(
				inn.freeHit
					? "Only a run out is possible on a free hit."
					: "That dismissal isn't possible on this delivery.",
			);
		if (w.playerOutId !== inn.strikerId && w.playerOutId !== inn.nonStrikerId)
			throw new ScoringError("Only a batter at the crease can be out.");
		if (w.kind !== "runOut" && w.playerOutId !== inn.strikerId)
			throw new ScoringError("Only a run out can dismiss the non-striker.");
	}

	const legal = e.extra !== "wide" && e.extra !== "noBall";
	const penalty = e.extra === "wide" || e.extra === "noBall" ? 1 : 0;
	const total = runs + extraRuns + penalty;
	const offBat = !e.extra || e.extra === "noBall" ? runs : 0;
	const bowlerRuns =
		offBat + (e.extra === "wide" ? 1 + extraRuns : 0) + (e.extra === "noBall" ? 1 : 0);

	// Over bookkeeping: an over starts with its first delivery of any kind.
	const overIndex = Math.floor(inn.legalBalls / 6);
	let over = inn.overs[overIndex];
	if (!over) {
		over = {
			number: overIndex + 1,
			bowlerId: inn.bowlerId,
			balls: [],
			runs: 0,
			bowlerRuns: 0,
			wickets: 0,
			legalBalls: 0,
		};
		inn.overs[overIndex] = over;
	}

	// Batter
	const striker = inn.batters.find((b) => b.playerId === inn.strikerId)!;
	if (e.extra !== "wide") striker.balls += 1;
	striker.runs += offBat;
	if (offBat === 4) striker.fours += 1;
	if (offBat === 6) striker.sixes += 1;

	// Bowler
	const bowler = getBowler(inn, inn.bowlerId);
	if (legal) bowler.legalBalls += 1;
	bowler.runs += bowlerRuns;
	if (e.extra === "wide") bowler.wides += 1 + extraRuns;
	if (e.extra === "noBall") bowler.noBalls += 1;
	if (legal && bowlerRuns === 0) bowler.dots += 1;

	// Team
	if (e.extra === "wide") inn.extras.wides += 1 + extraRuns;
	if (e.extra === "noBall") inn.extras.noBalls += 1;
	if (e.extra === "bye") inn.extras.byes += extraRuns;
	if (e.extra === "legBye") inn.extras.legByes += extraRuns;
	inn.runs += total;
	if (legal) inn.legalBalls += 1;
	inn.partnership.runs += total;
	if (legal) inn.partnership.balls += 1;

	over.balls.push(ballLabel(e, total));
	over.runs += total;
	over.bowlerRuns += bowlerRuns;
	if (legal) over.legalBalls += 1;

	// Batters cross on an odd number of runs actually run.
	const ranRuns = !e.extra || e.extra === "noBall" ? runs : extraRuns;
	if (ranRuns % 2 === 1) [inn.strikerId, inn.nonStrikerId] = [inn.nonStrikerId, inn.strikerId];

	if (e.wicket) {
		const w = e.wicket;
		inn.wickets += 1;
		over.wickets += 1;
		if (isBowlerCredited(w.kind)) bowler.wickets += 1;
		const out = inn.batters.find((b) => b.playerId === w.playerOutId)!;
		out.dismissal = { ...w, bowlerId: bowler.playerId };
		inn.fallOfWickets.push({
			wicket: inn.wickets,
			runs: inn.runs,
			legalBalls: inn.legalBalls,
			playerId: w.playerOutId,
		});
		if (inn.strikerId === w.playerOutId) inn.strikerId = null;
		else inn.nonStrikerId = null;
		inn.partnership = { runs: 0, balls: 0 };
	}

	// A no-ball earns a free hit; a wide or no-ball on a free hit carries it over.
	inn.freeHit = e.extra === "noBall" || (inn.freeHit && e.extra === "wide");

	// End of over
	if (legal && inn.legalBalls % 6 === 0) {
		if (over.bowlerRuns === 0 && over.legalBalls === 6) bowler.maidens += 1;
		[inn.strikerId, inn.nonStrikerId] = [inn.nonStrikerId, inn.strikerId];
		inn.previousOverBowlerId = inn.bowlerId;
		inn.bowlerId = null;
	}

	// End of innings
	if (inn.wickets >= maxWickets(match, inn.battingTeam)) inn.closed = "allOut";
	else if (target !== null && inn.runs >= target) inn.closed = "target";
	else if (inn.legalBalls >= ballsPerInnings) inn.closed = "overs";
}

function applyEvent(match: Match, state: MatchState, e: MatchEvent) {
	const inn = state.current;

	switch (e.type) {
		case "startInnings": {
			const next = state.innings.length + 1;
			if (next > 2) throw new ScoringError("Both innings have been played.");
			if (inn && !inn.closed) throw new ScoringError("The current innings is still going.");
			const created = newInnings(match, next as 1 | 2, e);
			state.innings.push(created);
			state.current = created;
			return;
		}
		case "ball":
			if (!inn) throw new ScoringError("Start the innings first.");
			applyBall(match, inn, e, state.target, state.ballsPerInnings);
			break;
		case "newBatter": {
			if (!inn || inn.closed) throw new ScoringError("No innings in progress.");
			if (inn.strikerId && inn.nonStrikerId) throw new ScoringError("Both batters are in.");
			const squad = match.teams[inn.battingTeam].players;
			if (!squad.some((p) => p.id === e.playerId))
				throw new ScoringError("That player isn't in the batting side.");
			if (inn.batters.some((b) => b.playerId === e.playerId))
				throw new ScoringError("That player has already batted.");
			inn.batters.push(batterLine(e.playerId, inn.batters.length + 1));
			if (!inn.strikerId) inn.strikerId = e.playerId;
			else inn.nonStrikerId = e.playerId;
			break;
		}
		case "newBowler": {
			if (!inn || inn.closed) throw new ScoringError("No innings in progress.");
			if (inn.bowlerId) throw new ScoringError("An over is already in progress.");
			const squad = match.teams[inn.bowlingTeam].players;
			if (!squad.some((p) => p.id === e.playerId))
				throw new ScoringError("That player isn't in the fielding side.");
			if (e.playerId === inn.previousOverBowlerId)
				throw new ScoringError("A bowler can't bowl two overs in a row.");
			inn.bowlerId = e.playerId;
			getBowler(inn, e.playerId);
			break;
		}
		case "swapStrike":
			if (!inn || inn.closed) throw new ScoringError("No innings in progress.");
			[inn.strikerId, inn.nonStrikerId] = [inn.nonStrikerId, inn.strikerId];
			break;
		case "endInnings":
			if (!inn || inn.closed) throw new ScoringError("No innings in progress.");
			inn.closed = "declared";
			break;
	}

	if (state.innings[0]?.closed && state.target === null) {
		state.target = state.innings[0].runs + 1;
	}
}

function computeResult(match: Match, state: MatchState): MatchResult | null {
	const [first, second] = state.innings;
	if (!first?.closed || !second?.closed) return null;
	const names = match.teams;
	if (second.runs >= first.runs + 1) {
		const margin = maxWickets(match, second.battingTeam) - second.wickets;
		const ballsLeft = state.ballsPerInnings - second.legalBalls;
		return {
			winner: second.battingTeam,
			by: "wickets",
			margin,
			text: `${names[second.battingTeam].name} won by ${margin} wicket${margin === 1 ? "" : "s"}${
				ballsLeft > 0 ? ` (${ballsLeft} ball${ballsLeft === 1 ? "" : "s"} left)` : ""
			}`,
		};
	}
	if (second.runs === first.runs) {
		return { winner: null, by: "tie", margin: 0, text: "Match tied" };
	}
	const margin = first.runs - second.runs;
	return {
		winner: first.battingTeam,
		by: "runs",
		margin,
		text: `${names[first.battingTeam].name} won by ${margin} run${margin === 1 ? "" : "s"}`,
	};
}

/** Replays every event. Throws `ScoringError` if an event breaks the rules. */
export function computeMatchState(match: Match, events: MatchEvent[] = match.events): MatchState {
	const state: MatchState = {
		innings: [],
		current: null,
		target: null,
		ballsPerInnings: match.oversPerInnings * 6,
		pending: null,
		result: null,
	};
	for (const e of events) applyEvent(match, state, e);

	state.result = computeResult(match, state);
	const inn = state.current;
	if (state.result) state.pending = null;
	else if (!inn) state.pending = { kind: "openers", innings: 1 };
	else if (inn.closed) state.pending = { kind: "openers", innings: 2 };
	else if (!inn.strikerId || !inn.nonStrikerId) state.pending = { kind: "newBatter" };
	else if (!inn.bowlerId) state.pending = { kind: "newBowler" };
	return state;
}

/** Validates an event against the match before it is stored. */
export function tryApply(match: Match, event: MatchEvent): string | null {
	try {
		computeMatchState(match, [...match.events, event]);
		return null;
	} catch (err) {
		if (err instanceof ScoringError) return err.message;
		throw err;
	}
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export type MatchPhase = "setup" | "live" | "inningsBreak" | "completed";

export function matchPhase(state: MatchState): MatchPhase {
	if (state.result) return "completed";
	if (!state.current) return "setup";
	if (state.current.closed) return "inningsBreak";
	return "live";
}

/** Batting-side players who have not come in yet. */
export function yetToBat(match: Match, inn: InningsState) {
	const batted = new Set(inn.batters.map((b) => b.playerId));
	return match.teams[inn.battingTeam].players.filter((p) => !batted.has(p.id));
}

/** Fielding-side players, with whether they may bowl the next over. */
export function bowlerChoices(match: Match, inn: InningsState) {
	return match.teams[inn.bowlingTeam].players.map((p) => ({
		player: p,
		allowed: p.id !== inn.previousOverBowlerId,
		line: inn.bowlers.find((b) => b.playerId === p.id) ?? null,
	}));
}

export function currentOver(inn: InningsState): OverRecord | null {
	const idx = Math.floor(inn.legalBalls / 6);
	return (
		inn.overs[idx] ??
		(inn.legalBalls > 0 && inn.legalBalls % 6 === 0 ? (inn.overs[idx - 1] ?? null) : null)
	);
}
