/**
 * Keeps docs/CRICKET_RULES.md and the tests in lockstep: every rule defined in the spec is cited
 * by at least one test title, and every rule a test cites exists in the spec.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const spec = readFileSync(new URL("docs/CRICKET_RULES.md", root), "utf8");
const defined = new Set([...spec.matchAll(/\*\*(R-[A-Z]+-\d+)/g)].map((m) => m[1]!));

function testFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory()
			? testFiles(join(dir, e.name))
			: e.name.endsWith(".test.ts")
				? [join(dir, e.name)]
				: [],
	);
}
const titles = testFiles(
	new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
).flatMap((f) =>
	[...readFileSync(f, "utf8").matchAll(/\bit\(\s*["`]([^"`]+)["`]/g)].map((m) => m[1]!),
);
const cited = new Set(titles.flatMap((t) => [...t.matchAll(/R-[A-Z]+-\d+/g)].map((m) => m[0])));

describe("rules coverage", () => {
	it("finds the spec's rules", () => {
		expect(defined.size).toBeGreaterThanOrEqual(100);
	});

	it("every rule in CRICKET_RULES.md is cited by a test", () => {
		expect([...defined].filter((id) => !cited.has(id))).toEqual([]);
	});

	it("every rule cited by a test exists in CRICKET_RULES.md", () => {
		expect([...cited].filter((id) => !defined.has(id))).toEqual([]);
	});
});
