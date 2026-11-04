/** Read messages from the dev mailbox (Mailpit) — where sign-in codes and dev SMS land. */
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface Summary {
	ID: string;
	Subject: string;
	Snippet: string;
}

async function search(to: string): Promise<Summary[]> {
	const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
	return ((await res.json()) as { messages: Summary[] }).messages;
}

/** Newest message to `to` that satisfies `match`, polling until it arrives. */
export async function latestMessage(
	to: string,
	match: (m: Summary) => boolean = () => true,
	timeoutMs = 15_000,
): Promise<Summary> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const found = (await search(to)).find(match);
		if (found !== undefined) return found;
		await new Promise((r) => setTimeout(r, 300));
	}
	throw new Error(`No matching message for ${to} within ${timeoutMs} ms`);
}

const CODE = /\b(\d{6})\b/;

/** The most recent sign-in code sent to `to` (email or dev SMS), optionally not `stale`. */
export async function codeFor(to: string, stale?: string): Promise<string> {
	const m = await latestMessage(to, (msg) => {
		const code = CODE.exec(`${msg.Subject} ${msg.Snippet}`)?.[1];
		return code !== undefined && code !== stale;
	});
	return CODE.exec(`${m.Subject} ${m.Snippet}`)![1]!;
}

export const uniqueEmail = (prefix: string): string =>
	`${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
