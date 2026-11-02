/**
 * Replay an event log and print the scorecard.
 *
 *   pnpm --filter @cricket/scoring-engine replay <log.json> [--json] [--at <seq>]
 *   pnpm --filter @cricket/scoring-engine replay <cricsheet.json> --cricsheet [--tie-breaker <id>]
 *
 * <log.json> is an array of events or { "events": [...] }.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { RuleViolation, format, replay } from "../src";
import type { MatchEvent } from "../src/types/events";
import type { TieBreaker } from "../src/types/rules";
import { convertCricsheet, type CricsheetMatch } from "./cricsheet/convert";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		json: { type: "boolean", default: false },
		at: { type: "string" },
		cricsheet: { type: "boolean", default: false },
		"tie-breaker": { type: "string" },
		help: { type: "boolean", short: "h", default: false },
	},
});

const file = positionals[0];
if (values.help || file === undefined) {
	console.log("Usage: replay <log.json> [--json] [--at <seq>] [--cricsheet [--tie-breaker <id>]]");
	process.exit(file === undefined && !values.help ? 1 : 0);
}

const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
let log: MatchEvent[];
if (values.cricsheet) {
	const tieBreaker = values["tie-breaker"] as TieBreaker | undefined;
	log = convertCricsheet(
		raw as CricsheetMatch,
		tieBreaker === undefined ? {} : { rules: { tieBreaker } },
	);
} else {
	log = (Array.isArray(raw) ? raw : (raw as { events: MatchEvent[] }).events) as MatchEvent[];
}
if (values.at !== undefined) {
	const at = Number(values.at);
	log = log.filter((e) => e.seq <= at);
}

try {
	const state = replay(log);
	if (values.json) console.log(JSON.stringify({ events: log.length, state }, null, 2));
	else console.log(format.formatScorecard(state));
} catch (error) {
	if (error instanceof RuleViolation) {
		console.error(
			`Rejected at seq ${error.seq ?? "?"}: [${error.code} ${error.rule}] ${error.message}`,
		);
		process.exit(2);
	}
	throw error;
}
