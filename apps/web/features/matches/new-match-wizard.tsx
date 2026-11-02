"use client";

import { ArrowLeft, ArrowRight, Check, Coins, Plus, Sparkles, Swords, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Team, TeamIndex } from "@/lib/cricket/types";
import { createMatch, loadSampleTeams, useDB } from "@/lib/store";
import {
	Button,
	Card,
	Choice,
	EmptyState,
	Field,
	PageHeader,
	PageSkeleton,
	Segmented,
	TeamBadge,
	cx,
	inputClass,
} from "@/components/ui";
import { TeamEditor } from "@/features/teams/team-editor";

const STEPS = ["Teams", "Format", "Toss"] as const;
const OVER_PRESETS = [5, 10, 20, 50];
const MAX_XI = 11;

export function NewMatchWizard() {
	const db = useDB();
	const router = useRouter();
	const [step, setStep] = useState(0);
	const [teamIds, setTeamIds] = useState<[string | null, string | null]>([null, null]);
	const [picking, setPicking] = useState<TeamIndex>(0);
	const [overs, setOvers] = useState(20);
	const [xi, setXi] = useState<[string[], string[]]>([[], []]);
	const [venue, setVenue] = useState("");
	const [tossWinner, setTossWinner] = useState<TeamIndex | null>(null);
	const [decision, setDecision] = useState<"bat" | "bowl">("bat");
	const [editor, setEditor] = useState<number | null>(null);

	if (!db) return <PageSkeleton />;

	const teams = teamIds.map((id) => db.teams.find((t) => t.id === id) ?? null) as [
		Team | null,
		Team | null,
	];

	function selectTeam(team: Team) {
		const next: [string | null, string | null] = [...teamIds];
		const other = (1 - picking) as TeamIndex;
		if (next[other] === team.id) next[other] = null;
		next[picking] = team.id;
		setTeamIds(next);
		const nextXi: [string[], string[]] = [...xi];
		nextXi[picking] = team.players.slice(0, MAX_XI).map((p) => p.id);
		setXi(nextXi);
		setPicking(next[0] && !next[1] ? 1 : next[1] && !next[0] ? 0 : picking);
	}

	function togglePlayer(t: TeamIndex, id: string) {
		const next: [string[], string[]] = [[...xi[0]], [...xi[1]]];
		next[t] = next[t].includes(id) ? next[t].filter((x) => x !== id) : [...next[t], id];
		setXi(next);
	}

	const teamsValid = Boolean(teams[0] && teams[1]);
	const xiValid =
		xi[0].length >= 2 && xi[1].length >= 2 && xi[0].length <= MAX_XI && xi[1].length <= MAX_XI;
	const oversValid = Number.isInteger(overs) && overs >= 1 && overs <= 50;
	const canNext =
		step === 0 ? teamsValid : step === 1 ? xiValid && oversValid : tossWinner !== null;

	function start() {
		if (!teams[0] || !teams[1] || tossWinner === null) return;
		const snapshot = (t: Team, ids: string[]) => ({
			teamId: t.id,
			name: t.name,
			shortName: t.shortName,
			color: t.color,
			// Keep squad order, which is the natural batting order.
			players: t.players.filter((p) => ids.includes(p.id)),
		});
		const battingFirst = (decision === "bat" ? tossWinner : 1 - tossWinner) as TeamIndex;
		const match = createMatch({
			teams: [snapshot(teams[0], xi[0]), snapshot(teams[1], xi[1])],
			oversPerInnings: overs,
			toss: { winner: tossWinner, decision },
			battingFirst,
			venue: venue.trim() || undefined,
		});
		router.push(`/local/matches/${match.id}`);
	}

	if (db.teams.length < 2) {
		return (
			<div>
				<PageHeader title="New match" />
				<EmptyState
					icon={<Users className="size-8" aria-hidden="true" />}
					title="You need two teams"
					action={
						<>
							<Button onClick={() => setEditor(Date.now())}>
								<Plus className="size-4" aria-hidden="true" /> Create team
							</Button>
							<Button variant="secondary" onClick={loadSampleTeams}>
								<Sparkles className="size-4" aria-hidden="true" /> Load sample teams
							</Button>
						</>
					}
				>
					Create both squads first - it only takes a minute - or load sample teams to try it out.
				</EmptyState>
				{editor && <TeamEditor key={editor} open onClose={() => setEditor(null)} />}
			</div>
		);
	}

	function teamSlot(t: TeamIndex) {
		const team = teams[t];
		return (
			<button
				type="button"
				onClick={() => setPicking(t)}
				aria-pressed={picking === t}
				className={cx(
					"flex min-h-28 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed p-3 text-center transition",
					picking === t
						? "border-brand bg-brand-soft/60"
						: "border-line bg-surface hover:border-brand/40",
				)}
			>
				{team ? (
					<>
						<TeamBadge name={team.name} color={team.color} label={team.shortName} size={48} />
						<span className="line-clamp-2 font-semibold">{team.name}</span>
					</>
				) : (
					<>
						<span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">
							<Plus className="size-6" aria-hidden="true" />
						</span>
						<span className="text-sm font-semibold text-muted">Pick team {t + 1}</span>
					</>
				)}
			</button>
		);
	}

	return (
		<div className="mx-auto max-w-3xl">
			<PageHeader title="New match" />

			<ol className="mb-6 flex items-center gap-2" aria-label="Steps">
				{STEPS.map((s, i) => (
					<li key={s} className="flex flex-1 items-center gap-2">
						<span
							className={cx(
								"grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition",
								i < step
									? "bg-brand text-on-brand"
									: i === step
										? "bg-ink text-bg"
										: "bg-surface-2 text-muted",
							)}
							aria-current={i === step ? "step" : undefined}
						>
							{i < step ? <Check className="size-4" aria-hidden="true" /> : i + 1}
						</span>
						<span className={cx("text-sm font-semibold", i === step ? "text-ink" : "text-muted")}>
							{s}
						</span>
						{i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" />}
					</li>
				))}
			</ol>

			{step === 0 && (
				<div className="space-y-5">
					<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
						{teamSlot(0)}
						<span className="font-display text-2xl font-bold text-muted">VS</span>
						{teamSlot(1)}
					</div>

					<Card className="p-4">
						<div className="mb-3 flex items-center justify-between">
							<p className="text-sm font-semibold">
								Choose <span className="text-brand">team {picking + 1}</span>
							</p>
							<Button variant="ghost" size="sm" onClick={() => setEditor(Date.now())}>
								<Plus className="size-4" aria-hidden="true" /> New team
							</Button>
						</div>
						<div className="grid gap-2 sm:grid-cols-2">
							{db.teams.map((t) => {
								const selectedAs = teamIds.indexOf(t.id);
								return (
									<Choice
										key={t.id}
										selected={selectedAs === picking}
										onClick={() => selectTeam(t)}
									>
										<TeamBadge name={t.name} color={t.color} label={t.shortName} size={36} />
										<span className="min-w-0 flex-1">
											<span className="block truncate">{t.name}</span>
											<span className="block text-xs text-muted">{t.players.length} players</span>
										</span>
										{selectedAs !== -1 && (
											<span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
												Team {selectedAs + 1}
											</span>
										)}
									</Choice>
								);
							})}
						</div>
					</Card>
				</div>
			)}

			{step === 1 && teams[0] && teams[1] && (
				<div className="space-y-5">
					<Card className="space-y-4 p-5">
						<div>
							<span className="mb-2 block text-sm font-semibold">Overs per innings</span>
							<div className="flex flex-wrap items-center gap-2">
								{OVER_PRESETS.map((o) => (
									<Choice
										key={o}
										selected={overs === o}
										onClick={() => setOvers(o)}
										className="min-w-16 justify-center"
									>
										<span className="font-display text-xl font-bold">{o}</span>
									</Choice>
								))}
								<label className="flex items-center gap-2 text-sm text-muted">
									Custom
									<input
										type="number"
										min={1}
										max={50}
										inputMode="numeric"
										value={overs}
										onChange={(e) => setOvers(Number(e.target.value))}
										className={cx(inputClass, "h-12 w-24 text-center font-semibold text-ink")}
										aria-label="Custom overs"
									/>
								</label>
							</div>
							{!oversValid && (
								<p className="mt-2 text-sm text-wicket">Choose between 1 and 50 overs.</p>
							)}
						</div>
						<Field label="Venue" hint="Optional">
							<input
								className={inputClass}
								value={venue}
								maxLength={60}
								placeholder="Ground or city"
								onChange={(e) => setVenue(e.target.value)}
							/>
						</Field>
					</Card>

					{([0, 1] as const).map((t) => {
						const team = teams[t]!;
						const count = xi[t].length;
						return (
							<Card key={t} className="p-5">
								<div className="mb-3 flex items-center gap-3">
									<TeamBadge name={team.name} color={team.color} label={team.shortName} size={36} />
									<div className="flex-1">
										<p className="font-semibold">{team.name}</p>
										<p
											className={cx(
												"text-xs",
												count < 2 || count > MAX_XI ? "text-wicket" : "text-muted",
											)}
										>
											{count} selected · 2-{MAX_XI} players, in batting order
										</p>
									</div>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => {
											const next: [string[], string[]] = [[...xi[0]], [...xi[1]]];
											next[t] = count ? [] : team.players.slice(0, MAX_XI).map((p) => p.id);
											setXi(next);
										}}
									>
										{count ? "Clear" : "Select all"}
									</Button>
								</div>
								{team.players.length < 2 ? (
									<p className="text-sm text-wicket">
										This team has fewer than 2 players. Add players on the Teams page.
									</p>
								) : (
									<div className="flex flex-wrap gap-2">
										{team.players.map((p) => {
											const on = xi[t].includes(p.id);
											return (
												<button
													key={p.id}
													type="button"
													aria-pressed={on}
													onClick={() => togglePlayer(t, p.id)}
													className={cx(
														"inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition",
														on
															? "border-brand bg-brand-soft text-ink"
															: "border-line text-muted hover:border-brand/40",
													)}
												>
													{on && <Check className="size-3.5 text-brand" aria-hidden="true" />}
													{p.name}
												</button>
											);
										})}
									</div>
								)}
							</Card>
						);
					})}
				</div>
			)}

			{step === 2 && teams[0] && teams[1] && (
				<div className="space-y-5">
					<Card className="p-5">
						<p className="mb-3 flex items-center gap-2 text-sm font-semibold">
							<Coins className="size-4 text-extra" aria-hidden="true" /> Who won the toss?
						</p>
						<div className="grid gap-3 sm:grid-cols-2">
							{([0, 1] as const).map((t) => (
								<Choice
									key={t}
									selected={tossWinner === t}
									onClick={() => setTossWinner(t)}
									className="p-4"
								>
									<TeamBadge
										name={teams[t]!.name}
										color={teams[t]!.color}
										label={teams[t]!.shortName}
										size={40}
									/>
									<span className="font-semibold">{teams[t]!.name}</span>
								</Choice>
							))}
						</div>
						<p className="mb-3 mt-6 text-sm font-semibold">They chose to</p>
						<Segmented
							label="Toss decision"
							value={decision}
							onChange={setDecision}
							options={[
								{ value: "bat", label: "Bat first" },
								{ value: "bowl", label: "Bowl first" },
							]}
						/>
					</Card>

					{tossWinner !== null && (
						<Card className="pitch flex items-center gap-4 border-0 p-5">
							<Swords className="size-8 shrink-0 opacity-80" aria-hidden="true" />
							<div>
								<p className="font-display text-2xl font-bold uppercase tracking-wide">
									{teams[decision === "bat" ? tossWinner : ((1 - tossWinner) as TeamIndex)]!.name}{" "}
									bat first
								</p>
								<p className="text-sm text-white/80">
									{teams[tossWinner]!.name} won the toss and chose to {decision} · {overs} overs a
									side
									{venue.trim() && ` · ${venue.trim()}`}
								</p>
							</div>
						</Card>
					)}
				</div>
			)}

			<div className="sticky bottom-20 z-20 mt-8 flex gap-3 sm:bottom-4">
				{step > 0 && (
					<Button variant="secondary" size="lg" onClick={() => setStep(step - 1)}>
						<ArrowLeft className="size-5" aria-hidden="true" /> Back
					</Button>
				)}
				<div className="flex-1" />
				{step < STEPS.length - 1 ? (
					<Button size="lg" disabled={!canNext} onClick={() => setStep(step + 1)}>
						Next <ArrowRight className="size-5" aria-hidden="true" />
					</Button>
				) : (
					<Button size="lg" disabled={!canNext} onClick={start}>
						Start match <ArrowRight className="size-5" aria-hidden="true" />
					</Button>
				)}
			</div>

			{editor && (
				<TeamEditor
					key={editor}
					open
					onClose={() => setEditor(null)}
					onSaved={(t) => {
						if (t.players.length >= 2) selectTeam(t);
					}}
				/>
			)}
		</div>
	);
}
