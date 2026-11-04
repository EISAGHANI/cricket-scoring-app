import { createHmac, timingSafeEqual } from "node:crypto";

/** `<matchId>.<expiresAtUnixSeconds>.<hmac>`: proves the holder may see a match's lock channel. */
export function signScorerToken(secret: string, matchId: string, expiresAtSeconds: number): string {
	const body = `${matchId}.${expiresAtSeconds}`;
	return `${body}.${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyScorerToken(
	secret: string,
	matchId: string,
	token: unknown,
	nowSeconds: number,
): boolean {
	if (typeof token !== "string") return false;
	const [id, exp, mac, ...rest] = token.split(".");
	if (rest.length > 0 || id !== matchId || !exp || !mac) return false;
	if (!/^\d+$/.test(exp) || Number(exp) < nowSeconds) return false;
	const expected = createHmac("sha256", secret).update(`${id}.${exp}`).digest();
	const given = Buffer.from(mac, "hex");
	return given.length === expected.length && timingSafeEqual(given, expected);
}
