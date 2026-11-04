/** A scoring request the client must react to: 409 (resync), 422 (rule breach), 423 (lock). */
export class ScoringError extends Error {
	constructor(
		readonly status: 409 | 422 | 423,
		readonly code: string,
		message: string,
		readonly details: {
			lastSeq?: number;
			rule?: string;
			seq?: number | null;
			lock?: LockView | null;
		} = {},
	) {
		super(message);
		this.name = "ScoringError";
	}
}

/** What clients may see about a lock. */
export interface LockView {
	holderUserId: string;
	holderDeviceId: string;
	generation: number;
	expiresAt: string;
	/** The offer, if the holder is handing the lock over. */
	handoffToUserId: string | null;
	handoffToDeviceId: string | null;
}
