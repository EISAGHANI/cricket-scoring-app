/**
 * Player profile privacy (DATA_MODEL.md §3, Phase 2 Q5). Minors without guardian consent, and
 * profiles marked PRIVATE_TO_TEAM, are shown restricted to anyone who cannot view them privately:
 * initial + surname, no photo, no date of birth.
 */

export const ADULT_AGE = 18;

/** Whole years between an ISO date of birth and `today` (both YYYY-MM-DD). */
export function ageOn(dateOfBirth: string, today: string): number {
	const [by, bm, bd] = dateOfBirth.split("-").map(Number) as [number, number, number];
	const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
	const hadBirthday = tm > bm || (tm === bm && td >= bd);
	return ty - by - (hadBirthday ? 0 : 1);
}

export function isMinor(dateOfBirth: string | null, today: string): boolean {
	return dateOfBirth !== null && ageOn(dateOfBirth, today) < ADULT_AGE;
}

/** "Joe Root" → "J. Root"; "Joe" → "J." */
export function initialName(displayName: string): string {
	// split() always returns at least one element.
	const [first, ...rest] = displayName.trim().split(/\s+/) as [string, ...string[]];
	const initial = `${first.charAt(0).toUpperCase()}.`;
	return rest.length > 0 ? `${initial} ${rest.join(" ")}` : initial;
}

export interface PlayerPrivacyInput {
	displayName: string;
	dateOfBirth: string | null;
	photoUrl: string | null;
	visibility: "PUBLIC" | "PRIVATE_TO_TEAM";
	guardianConsent: boolean;
}

export interface PlayerPublicView {
	displayName: string;
	dateOfBirth: string | null;
	photoUrl: string | null;
	restricted: boolean;
}

export function playerView(
	p: PlayerPrivacyInput,
	canViewPrivate: boolean,
	today: string,
): PlayerPublicView {
	if (canViewPrivate) {
		return {
			displayName: p.displayName,
			dateOfBirth: p.dateOfBirth,
			photoUrl: p.photoUrl,
			restricted: false,
		};
	}
	const restricted =
		p.visibility === "PRIVATE_TO_TEAM" || (isMinor(p.dateOfBirth, today) && !p.guardianConsent);
	if (restricted)
		return {
			displayName: initialName(p.displayName),
			dateOfBirth: null,
			photoUrl: null,
			restricted,
		};
	return { displayName: p.displayName, dateOfBirth: null, photoUrl: p.photoUrl, restricted };
}
