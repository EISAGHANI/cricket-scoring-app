/**
 * SYNTHETIC resource table for tests only — NOT the official DLS table (ADR-0013).
 * Generated from the published Duckworth–Lewis functional form
 *   Z(u, w) = F(w) · (1 − exp(−b·u / F(w)))
 * with made-up parameters, normalised so 50 overs / 0 wickets = 100%.
 */
import type { ResourceTable } from "../../src/target-revision/strategies";

const F = [1, 0.93, 0.85, 0.75, 0.63, 0.5, 0.37, 0.25, 0.14, 0.06];
const B = 0.035;
const z = (u: number, w: number): number => F[w]! * (1 - Math.exp((-B * u) / F[w]!));
const full = z(50, 0);

export const SYNTHETIC_TABLE: ResourceTable = {
	source: "SYNTHETIC (tests only) — not an official DLS table",
	rows: Array.from({ length: 51 }, (_, u) =>
		Array.from({ length: 10 }, (_, w) => Math.round((1000 * z(u, w)) / full) / 10),
	),
};
