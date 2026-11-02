import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers";

const csp = (h: { key: string; value: string }[]) =>
	h.find((x) => x.key === "Content-Security-Policy")!.value;

describe("securityHeaders", () => {
	it("locks down sources and allows the media origin for images", () => {
		const h = securityHeaders({
			appUrl: "https://cricket.example",
			mediaUrl: "https://media.example/bucket",
			dev: false,
		});
		expect(csp(h)).toContain("img-src 'self' blob: data: https://media.example");
		expect(csp(h)).toContain("frame-ancestors 'none'");
		expect(csp(h)).toContain("object-src 'none'");
		expect(csp(h)).not.toContain("unsafe-eval");
		expect(csp(h)).toContain("upgrade-insecure-requests");
		expect(h.map((x) => x.key)).toContain("Strict-Transport-Security");
	});

	it("does not upgrade or pin HTTPS on http (local, CI) and allows eval in dev", () => {
		const h = securityHeaders({ appUrl: "http://localhost:3000", mediaUrl: undefined, dev: true });
		expect(csp(h)).not.toContain("upgrade-insecure-requests");
		expect(csp(h)).toContain("'unsafe-eval'");
		expect(csp(h)).toContain("img-src 'self' blob: data:;");
		expect(h.map((x) => x.key)).not.toContain("Strict-Transport-Security");
	});
});
