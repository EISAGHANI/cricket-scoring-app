"use client";

import { PRESETS } from "@cricket/scoring-engine";
import { ArrowLeft, ArrowRight, Check, Plus, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, Card, Choice, Field, cx, inputClass } from "@/components/ui";
import type { ActionResult } from "@/lib/services/result";
import {
	createGuestPlayerAction,
	createMatchAction,
	createVenueAction,
	sideOptionsAction,
} from "./actions";
import type { SideOption, TeamOption, VenueOption } from "./queries";
import { PRESET_IDS } from "./schemas";

type PresetId = (typeof PRESET_IDS)[number];

export const PRESET_LABEL: Record<PresetId, { name: string; detail: string }> = {
	T20: { name: "T20", detail: "20 overs a side" },
	ODI: { name: "One-day", detail: "50 overs a side" },
	T10: { name: "T10", detail: "10 overs a side" },
	HUNDRED: { name: "The Hundred", detail: "100 balls, 5-ball sets" },
	TEST: { name: "Test", detail: "Two innings, 5 days" },
	FIRST_CLASS_4DAY: { name: "First-class", detail: "Two innings, 4 days" },
	LAST_MAN_STANDS: { name: "Last Man Stands", detail: "8-a-side, last batter bats alone" },
	BOX_CRICKET: { name: "Box cricket", detail: "Short indoor format" },
	CUSTOM: { name: "Custom", detail: "Set your own overs and players" },
};

type Side = "home" | "away";

interface SideState {
	options: SideOption | null;
	guests: { id: string; name: string }[];
	xi: string[];
	subs: string[];
	captainId: string | null;
	keeperId: string | null;
}

const emptySide = (): SideState => ({
	options: null,
	guests: [],
	xi: [],
	subs: [],
	captainId: null,
	keeperId: null,
});

const STEPS = ["Teams", "Format", "Home XI", "Away XI", "Details"] as const;

export function MatchWizard({
	myTeams,
	teams,
	venues,
}: {
	myTeams: TeamOption[];
	teams: TeamOption[];
	venues: VenueOption[];
}) {
	const [step, setStep] = useState(0);
	const [homeTeamId, setHomeTeamId] = useState<string>(myTeams[0]?.id ?? "");
	const [awayTeamId, setAwayTeamId] = useState<string>("");
	const [preset, setPreset] = useState<PresetId>("T20");
	const [overs, setOvers] = useState<number>(20);
	const [playersPerSide, setPlayersPerSide] = useState<number>(11);
	const [sides, setSides] = useState<Record<Side, SideState>>({
		home: emptySide(),
		away: emptySide(),
	});
	const [venueList, setVenueList] = useState(venues);
	const [venueId, setVenueId] = useState("");
	const [scheduledAt, setScheduledAt] = useState("");
	const [umpire1, setUmpire1] = useState("");
	const [umpire2, setUmpire2] = useState("");
	const [scorerIds, setScorerIds] = useState<string[]>([]);
	const [result, setResult] = useState<ActionResult<never> | null>(null);
	const [pending, startTransition] = useTransition();

	const rules = PRESETS[preset];
	const limited = rules.inningsPerSide === 1;
	const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";

	function choosePreset(p: PresetId) {
		setPreset(p);
		setOvers(PRESETS[p].oversPerInnings ?? 0);
		setPlayersPerSide(PRESETS[p].playersPerSide);
	}

	async function loadSide(side: Side, teamId: string) {
		const options = await sideOptionsAction(teamId);
		setSides((s) => ({ ...s, [side]: defaults(options, playersPerSide) }));
	}

	function updateSide(side: Side, change: (s: SideState) => SideState) {
		setSides((s) => ({ ...s, [side]: change(s[side]) }));
	}

	async function next() {
		if (step === 1) {
			// Load (or re-pick) both selections once the team size is known.
			await Promise.all([
				sides.home.options === null || sides.home.xi.length !== playersPerSide
					? loadSide("home", homeTeamId)
					: null,
				sides.away.options === null || sides.away.xi.length !== playersPerSide
					? loadSide("away", awayTeamId)
					: null,
			]);
		}
		setStep((s) => s + 1);
	}

	function submit() {
		const side = (s: SideState) => ({
			playerIds: s.xi,
			substituteIds: s.subs,
			captainId: s.captainId ?? "",
			keeperId: s.keeperId ?? "",
		});
		const input = {
			homeTeamId,
			awayTeamId,
			preset,
			...(limited ? { oversPerInnings: overs } : {}),
			playersPerSide,
			...(venueId === "" ? {} : { venueId }),
			...(scheduledAt === "" ? {} : { scheduledAt: new Date(scheduledAt).toISOString() }),
			...(umpire1.trim() === "" ? {} : { umpire1 }),
			...(umpire2.trim() === "" ? {} : { umpire2 }),
			home: side(sides.home),
			away: side(sides.away),
			scorerIds,
		};
		startTransition(async () => setResult(await createMatchAction(input)));
	}

	const sideValid = (s: SideState) =>
		s.xi.length === playersPerSide && s.captainId !== null && s.keeperId !== null;
	const canNext = [
		homeTeamId !== "" && awayTeamId !== "" && homeTeamId !== awayTeamId,
		(!limited || (overs >= 1 && overs <= 500)) && playersPerSide >= 2 && playersPerSide <= 15,
		sideValid(sides.home),
		sideValid(sides.away),
		true,
	][step];

	const people = [
		...(sides.home.options?.people ?? []),
		...(sides.away.options?.people ?? []),
	].filter((p, i, all) => all.findIndex((x) => x.userId === p.userId) === i);

	return (
		<div className="space-y-5">
			<ol className="flex gap-1.5" aria-label="Steps">
				{STEPS.map((label, i) => (
					<li
						key={label}
						aria-current={i === step ? "step" : undefined}
						className={cx(
							"flex-1 rounded-full py-1 text-center text-xs font-semibold",
							i === step
								? "bg-brand text-on-brand"
								: i < step
									? "bg-brand-soft text-ink"
									: "bg-surface-2 text-muted",
						)}
					>
						<span className="hidden sm:inline">{label}</span>
						<span className="sm:hidden">{i + 1}</span>
					</li>
				))}
			</ol>

			{step === 0 && (
				<Card className="space-y-4 p-5">
					<h2 className="font-display text-2xl font-bold uppercase tracking-wide">Teams</h2>
					<Field label="Your team (home)">
						<select
							className={inputClass}
							value={homeTeamId}
							onChange={(e) => {
								setHomeTeamId(e.target.value);
								setSides((s) => ({ ...s, home: emptySide() }));
							}}
						>
							{myTeams.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name}
								</option>
							))}
						</select>
					</Field>
					<Field label="Opponent (away)">
						<select
							className={inputClass}
							value={awayTeamId}
							onChange={(e) => {
								setAwayTeamId(e.target.value);
								setSides((s) => ({ ...s, away: emptySide() }));
							}}
						>
							<option value="">Choose a team…</option>
							{teams
								.filter((t) => t.id !== homeTeamId)
								.map((t) => (
									<option key={t.id} value={t.id}>
										{t.name}
									</option>
								))}
						</select>
					</Field>
				</Card>
			)}

			{step === 1 && (
				<Card className="space-y-4 p-5">
					<h2 className="font-display text-2xl font-bold uppercase tracking-wide">Format</h2>
					<div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Format">
						{PRESET_IDS.map((p) => (
							<Choice key={p} selected={preset === p} onClick={() => choosePreset(p)}>
								<span className="flex-1">
									<span className="block font-semibold">{PRESET_LABEL[p].name}</span>
									<span className="block text-xs text-muted">{PRESET_LABEL[p].detail}</span>
								</span>
							</Choice>
						))}
					</div>
					<div className="grid grid-cols-2 gap-3">
						{limited && (
							<Field label="Overs per side">
								<input
									type="number"
									inputMode="numeric"
									min={1}
									max={500}
									className={inputClass}
									value={overs}
									onChange={(e) => setOvers(Number(e.target.value))}
								/>
							</Field>
						)}
						<Field label="Players per side">
							<input
								type="number"
								inputMode="numeric"
								min={2}
								max={15}
								className={inputClass}
								value={playersPerSide}
								onChange={(e) => setPlayersPerSide(Number(e.target.value))}
							/>
						</Field>
					</div>
				</Card>
			)}

			{(step === 2 || step === 3) && (
				<SidePicker
					key={step}
					title={teamName(step === 2 ? homeTeamId : awayTeamId)}
					size={playersPerSide}
					state={sides[step === 2 ? "home" : "away"]}
					onChange={(change) => updateSide(step === 2 ? "home" : "away", change)}
				/>
			)}

			{step === 4 && (
				<Card className="space-y-4 p-5">
					<h2 className="font-display text-2xl font-bold uppercase tracking-wide">Details</h2>
					<VenuePicker
						venues={venueList}
						value={venueId}
						onChange={setVenueId}
						onCreated={(v) => {
							setVenueList((l) => [...l, v].sort((a, b) => a.name.localeCompare(b.name)));
							setVenueId(v.id);
						}}
					/>
					<Field label="Start time" hint="Optional">
						<input
							type="datetime-local"
							className={inputClass}
							value={scheduledAt}
							onChange={(e) => setScheduledAt(e.target.value)}
						/>
					</Field>
					<div className="grid gap-3 sm:grid-cols-2">
						<Field label="Umpire 1" hint="Optional">
							<input
								className={inputClass}
								value={umpire1}
								onChange={(e) => setUmpire1(e.target.value)}
								maxLength={80}
							/>
						</Field>
						<Field label="Umpire 2" hint="Optional">
							<input
								className={inputClass}
								value={umpire2}
								onChange={(e) => setUmpire2(e.target.value)}
								maxLength={80}
							/>
						</Field>
					</div>
					{people.length > 0 && (
						<fieldset>
							<legend className="mb-1.5 text-sm font-semibold">Scorers</legend>
							<p className="mb-2 text-xs text-muted">
								You can always score. Add people from either team who may score too.
							</p>
							<div className="flex flex-wrap gap-2">
								{people.map((p) => {
									const on = scorerIds.includes(p.userId);
									return (
										<button
											key={p.userId}
											type="button"
											aria-pressed={on}
											onClick={() =>
												setScorerIds((ids) =>
													on ? ids.filter((x) => x !== p.userId) : [...ids, p.userId],
												)
											}
											className={cx(
												"rounded-full border px-3 py-1.5 text-sm font-medium transition",
												on
													? "border-brand bg-brand-soft text-ink"
													: "border-line text-muted hover:border-brand/40",
											)}
										>
											{on && <Check className="mr-1 inline size-3.5" aria-hidden="true" />}
											{p.name}
										</button>
									);
								})}
							</div>
						</fieldset>
					)}
					{result !== null && !result.ok && (
						<div
							role="alert"
							className="rounded-xl bg-wicket/10 px-4 py-3 text-sm font-medium text-wicket"
						>
							<p>{result.error}</p>
							{Object.entries(result.fieldErrors).length > 0 && (
								<ul className="mt-1 list-disc pl-5">
									{Object.entries(result.fieldErrors).map(([k, v]) => (
										<li key={k}>{v}</li>
									))}
								</ul>
							)}
						</div>
					)}
				</Card>
			)}

			<div className="flex justify-between gap-3">
				<Button
					variant="secondary"
					onClick={() => setStep((s) => s - 1)}
					disabled={step === 0 || pending}
				>
					<ArrowLeft className="size-4" aria-hidden="true" /> Back
				</Button>
				{step < STEPS.length - 1 ? (
					<Button onClick={() => void next()} disabled={!canNext}>
						Next <ArrowRight className="size-4" aria-hidden="true" />
					</Button>
				) : (
					<Button onClick={submit} disabled={pending}>
						{pending ? "Creating…" : "Create match"}
					</Button>
				)}
			</div>
		</div>
	);
}

/** Default selection: captain first, then the rest of the squad in its listed order. */
function defaults(options: SideOption, size: number): SideState {
	const xi = options.squad.slice(0, size).map((p) => p.id);
	const captain = options.squad.find((p) => p.squadRole === "CAPTAIN" && xi.includes(p.id));
	const keeper = options.squad.find((p) => p.squadRole === "WICKET_KEEPER" && xi.includes(p.id));
	return {
		options,
		guests: [],
		xi,
		subs: [],
		captainId: captain?.id ?? xi[0] ?? null,
		keeperId: keeper?.id ?? xi[1] ?? xi[0] ?? null,
	};
}

function SidePicker({
	title,
	size,
	state,
	onChange,
}: {
	title: string;
	size: number;
	state: SideState;
	onChange: (change: (s: SideState) => SideState) => void;
}) {
	const [guest, setGuest] = useState("");
	const [error, setError] = useState("");
	const [pending, startTransition] = useTransition();
	const everyone = [...(state.options?.squad ?? []), ...state.guests];

	function toggle(id: string) {
		onChange((s) => {
			if (s.xi.includes(id)) {
				const xi = s.xi.filter((x) => x !== id);
				return {
					...s,
					xi,
					captainId: s.captainId === id ? null : s.captainId,
					keeperId: s.keeperId === id ? null : s.keeperId,
				};
			}
			return { ...s, xi: [...s.xi, id], subs: s.subs.filter((x) => x !== id) };
		});
	}

	function addGuest() {
		const name = guest.trim();
		if (name.length < 2) return;
		startTransition(async () => {
			const r = await createGuestPlayerAction(name);
			if (!r.ok) {
				setError(r.fieldErrors.displayName ?? r.error);
				return;
			}
			setError("");
			setGuest("");
			onChange((s) => ({
				...s,
				guests: [...s.guests, { id: r.data.id, name: r.data.displayName }],
				xi: s.xi.length < size ? [...s.xi, r.data.id] : s.xi,
			}));
		});
	}

	return (
		<Card className="space-y-4 p-5">
			<div className="flex items-end justify-between gap-3">
				<h2 className="font-display text-2xl font-bold uppercase tracking-wide">{title}</h2>
				<p
					className={cx(
						"tabular text-sm font-semibold",
						state.xi.length === size ? "text-brand" : "text-muted",
					)}
					aria-live="polite"
				>
					{state.xi.length}/{size} picked
				</p>
			</div>
			<p className="text-sm text-muted">
				Tap players in batting order. Mark the captain (C) and wicket-keeper (WK). Players not in
				the XI can be named as substitutes.
			</p>
			{everyone.length === 0 && (
				<p className="text-sm text-muted">
					This team has no squad yet. Add players as guests below.
				</p>
			)}
			<ul className="space-y-2">
				{everyone.map((p) => {
					const order = state.xi.indexOf(p.id);
					const inXI = order >= 0;
					const isSub = state.subs.includes(p.id);
					return (
						<li key={p.id} className="flex items-center gap-2">
							<Choice selected={inXI} onClick={() => toggle(p.id)} className="flex-1">
								<span className="tabular w-6 text-center text-sm font-bold text-muted">
									{inXI ? order + 1 : ""}
								</span>
								<span className="min-w-0 flex-1 truncate">{p.name}</span>
							</Choice>
							{inXI ? (
								<>
									<RoleToggle
										label="C"
										title={`Captain: ${p.name}`}
										on={state.captainId === p.id}
										onClick={() => onChange((s) => ({ ...s, captainId: p.id }))}
									/>
									<RoleToggle
										label="WK"
										title={`Wicket-keeper: ${p.name}`}
										on={state.keeperId === p.id}
										onClick={() => onChange((s) => ({ ...s, keeperId: p.id }))}
									/>
								</>
							) : (
								<RoleToggle
									label="Sub"
									title={`Substitute: ${p.name}`}
									on={isSub}
									onClick={() =>
										onChange((s) => ({
											...s,
											subs: isSub ? s.subs.filter((x) => x !== p.id) : [...s.subs, p.id],
										}))
									}
								/>
							)}
						</li>
					);
				})}
			</ul>
			<div>
				<label htmlFor="guest" className="mb-1.5 block text-sm font-semibold">
					Add a guest player
				</label>
				<div className="flex gap-2">
					<input
						id="guest"
						className={inputClass}
						value={guest}
						onChange={(e) => setGuest(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								addGuest();
							}
						}}
						placeholder="Full name"
						maxLength={80}
					/>
					<Button
						variant="secondary"
						onClick={addGuest}
						disabled={pending || guest.trim().length < 2}
					>
						<UserPlus className="size-4" aria-hidden="true" /> Add
					</Button>
				</div>
				{error !== "" && (
					<p role="alert" className="mt-1 text-sm text-wicket">
						{error}
					</p>
				)}
			</div>
		</Card>
	);
}

function RoleToggle({
	label,
	title,
	on,
	onClick,
}: {
	label: string;
	title: string;
	on: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={on}
			aria-label={title}
			onClick={onClick}
			className={cx(
				"h-12 min-w-12 rounded-xl border px-2 text-sm font-bold transition",
				on
					? "border-brand bg-brand text-on-brand"
					: "border-line bg-surface text-muted hover:border-brand/40",
			)}
		>
			{label}
		</button>
	);
}

function VenuePicker({
	venues,
	value,
	onChange,
	onCreated,
}: {
	venues: VenueOption[];
	value: string;
	onChange: (id: string) => void;
	onCreated: (v: VenueOption) => void;
}) {
	const [adding, setAdding] = useState(false);
	const [name, setName] = useState("");
	const [city, setCity] = useState("");
	const [error, setError] = useState("");
	const [pending, startTransition] = useTransition();

	function create() {
		startTransition(async () => {
			const r = await createVenueAction({ name, ...(city.trim() === "" ? {} : { city }) });
			if (!r.ok) {
				setError(r.fieldErrors.name ?? r.error);
				return;
			}
			onCreated({
				id: r.data.id,
				name: name.trim(),
				city: city.trim() === "" ? null : city.trim(),
			});
			setAdding(false);
			setName("");
			setCity("");
			setError("");
		});
	}

	return (
		<div>
			<Field label="Venue" hint="Optional">
				<select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
					<option value="">No venue</option>
					{venues.map((v) => (
						<option key={v.id} value={v.id}>
							{v.name}
							{v.city === null ? "" : `, ${v.city}`}
						</option>
					))}
				</select>
			</Field>
			{adding ? (
				<div className="mt-3 space-y-3 rounded-2xl bg-surface-2 p-4">
					<Field label="Ground name">
						<input
							className={inputClass}
							value={name}
							onChange={(e) => setName(e.target.value)}
							maxLength={120}
						/>
					</Field>
					<Field label="City" hint="Optional">
						<input
							className={inputClass}
							value={city}
							onChange={(e) => setCity(e.target.value)}
							maxLength={80}
						/>
					</Field>
					{error !== "" && (
						<p role="alert" className="text-sm text-wicket">
							{error}
						</p>
					)}
					<div className="flex gap-2">
						<Button size="sm" onClick={create} disabled={pending || name.trim().length < 2}>
							Save venue
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
							Cancel
						</Button>
					</div>
				</div>
			) : (
				<Button size="sm" variant="ghost" className="mt-2" onClick={() => setAdding(true)}>
					<Plus className="size-4" aria-hidden="true" /> New venue
				</Button>
			)}
		</div>
	);
}
