/** Replay benchmark over the golden matches: `pnpm --filter @cricket/scoring-engine bench`. */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { replay } from "../src";
import { convertCricsheet, type CricsheetMatch } from "./cricsheet/convert";

const matches: [string, string][] = [
	["1152848", "Test (Headingley 2019)"],
	["1152847", "Test (Lord's 2019)"],
	["1144504", "ODI (Old Trafford 2019)"],
	["1252666", "The Hundred"],
];
for (const [id, label] of matches) {
	const file = new URL(`../test/golden/cricsheet/${id}.json`, import.meta.url);
	const log = convertCricsheet(JSON.parse(readFileSync(file, "utf8")) as CricsheetMatch);
	for (let i = 0; i < 5; i++) replay(log); // warm up
	const times: number[] = [];
	for (let i = 0; i < 30; i++) {
		const t = performance.now();
		replay(log);
		times.push(performance.now() - t);
	}
	times.sort((a, b) => a - b);
	const median = times[Math.floor(times.length / 2)]!;
	console.log(
		`${label.padEnd(26)} ${String(log.length).padStart(5)} events  median ${median.toFixed(1)} ms  p95 ${times[Math.floor(times.length * 0.95)]!.toFixed(1)} ms`,
	);
}
