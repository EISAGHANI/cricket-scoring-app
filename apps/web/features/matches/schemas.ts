import type { PresetId } from "@cricket/scoring-engine";
import { z } from "zod";

export const PRESET_IDS = [
	"T20",
	"ODI",
	"T10",
	"HUNDRED",
	"TEST",
	"FIRST_CLASS_4DAY",
	"LAST_MAN_STANDS",
	"BOX_CRICKET",
	"CUSTOM",
] as const satisfies readonly PresetId[];

const Side = z
	.object({
		/** The XI in batting order. */
		playerIds: z.array(z.uuid()).min(2, "Pick the playing XI").max(15),
		substituteIds: z.array(z.uuid()).max(10).default([]),
		captainId: z.uuid("Pick a captain"),
		keeperId: z.uuid("Pick a wicket-keeper"),
	})
	.refine(
		(s) =>
			new Set([...s.playerIds, ...s.substituteIds]).size ===
			s.playerIds.length + s.substituteIds.length,
		{
			message: "A player is listed twice",
			path: ["playerIds"],
		},
	)
	.refine((s) => s.playerIds.includes(s.captainId), {
		message: "The captain must be in the XI",
		path: ["captainId"],
	})
	.refine((s) => s.playerIds.includes(s.keeperId), {
		message: "The wicket-keeper must be in the XI",
		path: ["keeperId"],
	});

const official = z.string().trim().min(2, "At least 2 characters").max(80).optional();

export const MatchInput = z.object({
	homeTeamId: z.uuid("Pick the home team"),
	awayTeamId: z.uuid("Pick the away team"),
	preset: z.enum(PRESET_IDS),
	/** Overrides on the preset (limited-overs formats only for overs). */
	oversPerInnings: z.int().min(1).max(500).optional(),
	playersPerSide: z.int().min(2).max(15).optional(),
	bowlerMaxOvers: z.int().min(1).max(500).nullable().optional(),
	venueId: z.uuid().optional(),
	scheduledAt: z.iso.datetime({ offset: true }).optional(),
	home: Side,
	away: Side,
	umpire1: official,
	umpire2: official,
	referee: official,
	/** Users who may score besides the creator. */
	scorerIds: z.array(z.uuid()).max(4).default([]),
});
export type MatchInput = z.input<typeof MatchInput>;

export const GuestPlayerInput = z.object({
	displayName: z.string().trim().min(2, "At least 2 characters").max(80),
});
