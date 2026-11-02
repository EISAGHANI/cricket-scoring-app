"use client";

import { Check, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { shortNameFrom } from "@/lib/cricket/format";
import type { Player, Team } from "@/lib/cricket/types";
import { deleteTeam, newId, saveTeam } from "@/lib/store";
import { Button, Field, Sheet, TeamBadge, cx, inputClass } from "@/components/ui";

export const TEAM_COLORS = [
	"#16a34a",
	"#0284c7",
	"#7c3aed",
	"#dc2626",
	"#ea580c",
	"#0891b2",
	"#db2777",
	"#334155",
];

/** Create or edit a team. Mount with a `key` so state resets per team. */
export function TeamEditor({
	team,
	open,
	onClose,
	onSaved,
}: {
	team?: Team;
	open: boolean;
	onClose: () => void;
	onSaved?: (team: Team) => void;
}) {
	const [name, setName] = useState(team?.name ?? "");
	const [shortName, setShortName] = useState(team?.shortName ?? "");
	const [shortEdited, setShortEdited] = useState(Boolean(team));
	const [location, setLocation] = useState(team?.location ?? "");
	const [color, setColor] = useState(team?.color ?? TEAM_COLORS[0]);
	const [players, setPlayers] = useState<Player[]>(team?.players ?? []);
	const [draft, setDraft] = useState("");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [error, setError] = useState("");

	const effectiveShort = (shortEdited ? shortName : shortNameFrom(name)).toUpperCase().slice(0, 4);

	function addPlayers(text: string) {
		const names = text
			.split(/[\n,;]+/)
			.map((s) => s.trim())
			.filter(Boolean);
		if (names.length === 0) return;
		setPlayers((prev) => {
			const existing = new Set(prev.map((p) => p.name.toLowerCase()));
			const fresh = names
				.filter((n) => !existing.has(n.toLowerCase()))
				.map((n) => ({ id: newId(), name: n }));
			return [...prev, ...fresh];
		});
		setDraft("");
	}

	function save() {
		if (!name.trim()) return setError("Give the team a name.");
		const saved = saveTeam(
			{
				name: name.trim(),
				shortName: effectiveShort || shortNameFrom(name),
				location: location.trim() || undefined,
				color,
				players,
			},
			team?.id,
		);
		onSaved?.(saved);
		onClose();
	}

	return (
		<Sheet
			open={open}
			onClose={onClose}
			title={team ? "Edit team" : "New team"}
			footer={
				<div className="flex items-center gap-2">
					{team && (
						<Button
							variant={confirmDelete ? "danger" : "ghost"}
							onClick={() => {
								if (!confirmDelete) return setConfirmDelete(true);
								deleteTeam(team.id);
								onClose();
							}}
						>
							<Trash2 className="size-4" aria-hidden="true" />
							{confirmDelete ? "Tap again to delete" : "Delete"}
						</Button>
					)}
					<div className="flex-1" />
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={save}>
						<Check className="size-4" aria-hidden="true" /> Save team
					</Button>
				</div>
			}
		>
			<div className="space-y-5">
				<div className="flex items-center gap-4">
					<TeamBadge name={name || "?"} color={color} label={effectiveShort || "?"} size={64} />
					<div className="flex-1">
						<Field label="Team name">
							<input
								className={inputClass}
								value={name}
								autoFocus
								maxLength={40}
								placeholder="e.g. Karlsruhe Strikers"
								onChange={(e) => {
									setName(e.target.value);
									setError("");
								}}
							/>
						</Field>
					</div>
				</div>
				{error && <p className="text-sm font-medium text-wicket">{error}</p>}

				<div className="grid grid-cols-2 gap-3">
					<Field label="Short name" hint="Up to 4 letters">
						<input
							className={cx(inputClass, "uppercase")}
							value={effectiveShort}
							maxLength={4}
							onChange={(e) => {
								setShortEdited(true);
								setShortName(e.target.value);
							}}
						/>
					</Field>
					<Field label="Location" hint="Optional">
						<input
							className={inputClass}
							value={location}
							maxLength={40}
							placeholder="City or club"
							onChange={(e) => setLocation(e.target.value)}
						/>
					</Field>
				</div>

				<div>
					<span className="mb-1.5 block text-sm font-semibold">Colour</span>
					<div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Team colour">
						{TEAM_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								role="radio"
								aria-checked={color === c}
								aria-label={c}
								onClick={() => setColor(c)}
								className={cx(
									"grid size-10 place-items-center rounded-full transition",
									color === c ? "ring-4 ring-offset-2 ring-offset-surface" : "hover:scale-105",
								)}
								style={{ background: c, ["--tw-ring-color" as string]: c }}
							>
								{color === c && <Check className="size-5 text-white" aria-hidden="true" />}
							</button>
						))}
					</div>
				</div>

				<div>
					<div className="mb-1.5 flex items-baseline justify-between">
						<span className="text-sm font-semibold">Squad</span>
						<span className="text-xs text-muted">
							{players.length} player{players.length === 1 ? "" : "s"}
						</span>
					</div>
					<div className="flex gap-2">
						<input
							className={inputClass}
							value={draft}
							placeholder="Player name - or paste a list"
							onChange={(e) => setDraft(e.target.value)}
							onPaste={(e) => {
								const text = e.clipboardData.getData("text");
								if (/[\n,;]/.test(text)) {
									e.preventDefault();
									addPlayers(text);
								}
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									addPlayers(draft);
								}
							}}
						/>
						<Button onClick={() => addPlayers(draft)} aria-label="Add player" className="shrink-0">
							<Plus className="size-5" aria-hidden="true" />
						</Button>
					</div>
					{players.length < 2 && (
						<p className="mt-2 text-xs text-muted">
							A team needs at least 2 players to play a match.
						</p>
					)}
					<ol className="mt-3 grid gap-2 sm:grid-cols-2">
						{players.map((p, i) => (
							<li
								key={p.id}
								className="flex items-center gap-2 rounded-xl bg-surface-2 py-1.5 pl-3 pr-1.5"
							>
								<span className="tabular w-5 text-xs font-semibold text-muted">{i + 1}</span>
								<input
									aria-label={`Player ${i + 1} name`}
									className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
									value={p.name}
									onChange={(e) =>
										setPlayers((prev) =>
											prev.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)),
										)
									}
								/>
								<button
									type="button"
									aria-label={`Remove ${p.name}`}
									onClick={() => setPlayers((prev) => prev.filter((x) => x.id !== p.id))}
									className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-wicket"
								>
									<X className="size-4" aria-hidden="true" />
								</button>
							</li>
						))}
					</ol>
				</div>
			</div>
		</Sheet>
	);
}
