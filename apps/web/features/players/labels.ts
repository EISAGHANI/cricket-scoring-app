export const ROLE_LABEL = {
	BATTER: "Batter",
	BOWLER: "Bowler",
	ALL_ROUNDER: "All-rounder",
	WICKET_KEEPER: "Wicket-keeper",
} as const;

export const HAND_LABEL = { RIGHT: "Right-hand bat", LEFT: "Left-hand bat" } as const;

export const BOWLING_LABEL: Record<string, string> = {
	RIGHT_ARM_FAST: "Right-arm fast",
	RIGHT_ARM_MEDIUM_FAST: "Right-arm medium-fast",
	RIGHT_ARM_MEDIUM: "Right-arm medium",
	RIGHT_ARM_OFF_BREAK: "Right-arm off-break",
	RIGHT_ARM_LEG_BREAK: "Right-arm leg-break",
	LEFT_ARM_FAST: "Left-arm fast",
	LEFT_ARM_MEDIUM_FAST: "Left-arm medium-fast",
	LEFT_ARM_MEDIUM: "Left-arm medium",
	LEFT_ARM_ORTHODOX: "Left-arm orthodox",
	LEFT_ARM_WRIST_SPIN: "Left-arm wrist-spin",
};

export const SQUAD_ROLE_LABEL = {
	CAPTAIN: "Captain",
	VICE_CAPTAIN: "Vice-captain",
	WICKET_KEEPER: "Wicket-keeper",
	PLAYER: "Player",
} as const;

const notSet = { value: "", label: "Not set" };
export const roleOptions = [
	notSet,
	...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })),
];
export const handOptions = [
	notSet,
	...Object.entries(HAND_LABEL).map(([value, label]) => ({ value, label })),
];
export const bowlingOptions = [
	notSet,
	...Object.entries(BOWLING_LABEL).map(([value, label]) => ({ value, label })),
];
export const squadRoleOptions = Object.entries(SQUAD_ROLE_LABEL).map(([value, label]) => ({
	value,
	label,
}));
