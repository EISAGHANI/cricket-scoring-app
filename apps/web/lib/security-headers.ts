/**
 * Security headers for every response (M8, ADR-0016). CSP without nonces: nonces are
 * incompatible with Cache Components' static shells, so inline scripts are allowed, but every
 * other source is locked down.
 */
export interface SecurityHeaderOptions {
	appUrl: string;
	mediaUrl: string | undefined;
	/** The Socket.IO service; allowed for fetch and WebSocket connections. */
	realtimeUrl?: string | undefined;
	dev: boolean;
}

export function securityHeaders({
	appUrl,
	mediaUrl,
	realtimeUrl,
	dev,
}: SecurityHeaderOptions): { key: string; value: string }[] {
	const https = appUrl.startsWith("https://");
	const media = mediaUrl === undefined ? "" : ` ${new URL(mediaUrl).origin}`;
	const realtime =
		realtimeUrl === undefined
			? ""
			: ((u) => ` ${u.origin} ${u.protocol === "https:" ? "wss" : "ws"}://${u.host}`)(
					new URL(realtimeUrl),
				);
	const csp = [
		"default-src 'self'",
		`script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
		"style-src 'self' 'unsafe-inline'",
		`img-src 'self' blob: data:${media}`,
		"font-src 'self'",
		`connect-src 'self'${realtime}`,
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
		...(https ? ["upgrade-insecure-requests"] : []),
	].join("; ");
	return [
		{ key: "Content-Security-Policy", value: csp },
		{ key: "X-Content-Type-Options", value: "nosniff" },
		{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
		{ key: "X-Frame-Options", value: "DENY" },
		{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
		...(https
			? [
					{
						key: "Strict-Transport-Security",
						value: "max-age=63072000; includeSubDomains; preload",
					},
				]
			: []),
	];
}
