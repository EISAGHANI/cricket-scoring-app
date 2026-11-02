"use client";

import { useSyncExternalStore } from "react";
import { tryApply } from "./cricket/engine";
import type { Id, Match, MatchEvent, Player, Team } from "./cricket/types";

/**
 * Local-first persistence. Everything lives in the browser's localStorage, so
 * scoring works with no account, no server and no signal at the ground.
 * All writes go through this module; components subscribe via `useDB()`.
 */

export interface DB {
	version: 1;
	teams: Team[];
	matches: Match[];
}

const KEY = "crease-scorer:v1";
const EMPTY: DB = { version: 1, teams: [], matches: [] };

let cache: DB | null = null;
const listeners = new Set<() => void>();

function read(): DB {
	if (cache) return cache;
	try {
		const raw = window.localStorage.getItem(KEY);
		const parsed = raw ? (JSON.parse(raw) as DB) : null;
		cache = parsed?.version === 1 ? parsed : EMPTY;
	} catch {
		cache = EMPTY;
	}
	return cache;
}

function write(next: DB) {
	cache = next;
	try {
		window.localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		// Storage full or blocked (private mode): keep working in memory.
	}
	for (const l of listeners) l();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	const onStorage = (e: StorageEvent) => {
		if (e.key === KEY) {
			cache = null;
			listener();
		}
	};
	window.addEventListener("storage", onStorage);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", onStorage);
	};
}

/** `null` during server render and hydration; the stored data afterwards. */
export function useDB(): DB | null {
	return useSyncExternalStore(subscribe, read, () => null);
}

export const newId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/* ------------------------------ Teams ------------------------------ */

export type TeamInput = Pick<Team, "name" | "shortName" | "location" | "color"> & {
	players: Player[];
};

export function saveTeam(input: TeamInput, id?: Id): Team {
	const db = read();
	const now = Date.now();
	const existing = id ? db.teams.find((t) => t.id === id) : undefined;
	const team: Team = existing
		? { ...existing, ...input, updatedAt: now }
		: { ...input, id: newId(), createdAt: now, updatedAt: now };
	write({
		...db,
		teams: existing ? db.teams.map((t) => (t.id === id ? team : t)) : [...db.teams, team],
	});
	return team;
}

export function deleteTeam(id: Id) {
	const db = read();
	write({ ...db, teams: db.teams.filter((t) => t.id !== id) });
}

/* ----------------------------- Matches ----------------------------- */

export function createMatch(
	input: Omit<Match, "id" | "createdAt" | "updatedAt" | "events">,
): Match {
	const db = read();
	const now = Date.now();
	const match: Match = { ...input, id: newId(), createdAt: now, updatedAt: now, events: [] };
	write({ ...db, matches: [match, ...db.matches] });
	return match;
}

function updateMatch(id: Id, fn: (m: Match) => Match) {
	const db = read();
	write({
		...db,
		matches: db.matches.map((m) => (m.id === id ? { ...fn(m), updatedAt: Date.now() } : m)),
	});
}

/** Appends a scoring event if it is valid; returns an error message otherwise. */
export function recordEvent(matchId: Id, event: MatchEvent): string | null {
	const match = read().matches.find((m) => m.id === matchId);
	if (!match) return "Match not found.";
	const error = tryApply(match, event);
	if (error) return error;
	updateMatch(matchId, (m) => ({ ...m, events: [...m.events, event] }));
	return null;
}

export function undoLastEvent(matchId: Id) {
	updateMatch(matchId, (m) => ({ ...m, events: m.events.slice(0, -1) }));
}

export function deleteMatch(id: Id) {
	const db = read();
	write({ ...db, matches: db.matches.filter((m) => m.id !== id) });
}

/* --------------------------- Sample data --------------------------- */

const SAMPLE: Array<Omit<TeamInput, "players"> & { players: string[] }> = [
	{
		name: "Karlsruhe Strikers",
		shortName: "KAS",
		location: "Karlsruhe",
		color: "#16a34a",
		players: [
			"Ali Khan",
			"Ben Weber",
			"Chris Novak",
			"Daniyal Shah",
			"Elias Braun",
			"Faisal Iqbal",
			"Gregor Lang",
			"Hamza Butt",
			"Ivan Petrov",
			"Jonas Keller",
			"Kamran Ali",
		],
	},
	{
		name: "Berlin Royals",
		shortName: "BER",
		location: "Berlin",
		color: "#7c3aed",
		players: [
			"Liam Schulz",
			"Mohammad Eisa",
			"Noah Fischer",
			"Omar Siddiqui",
			"Paul Wagner",
			"Qasim Raza",
			"Ravi Patel",
			"Sami Haider",
			"Tom Becker",
			"Usman Tariq",
			"Viktor Hahn",
		],
	},
];

export function loadSampleTeams() {
	for (const t of SAMPLE) {
		saveTeam({ ...t, players: t.players.map((name) => ({ id: newId(), name })) });
	}
}

export function exportData(): string {
	return JSON.stringify(read(), null, 2);
}

export function clearAllData() {
	write(EMPTY);
}
