/** Read messages from the dev mailbox (Mailpit) — where sign-in codes and dev SMS land. */
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface Summary {
	ID: string;
	Subject: string;
	Snippet: string;
}

export async function latestMessage(to: string, timeoutMs = 15_000): Promise<Summary> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
		const body = (await res.json()) as { messages: Summary[] };
		const first = body.messages[0];
		if (first !== undefined) return first;
		await new Promise((r) => setTimeout(r, 300));
	}
	throw new Error(`No message for ${to} within ${timeoutMs} ms`);
}

export async function codeFor(to: string): Promise<string> {
	const m = await latestMessage(to);
	const code = /\b(\d{6})\b/.exec(`${m.Subject} ${m.Snippet}`)?.[1];
	if (code === undefined) throw new Error(`No code in message to ${to}`);
	return code;
}

export const uniqueEmail = (prefix: string): string =>
	`${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
