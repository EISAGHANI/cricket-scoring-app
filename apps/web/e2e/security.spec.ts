import { expect, test } from "@playwright/test";
import { codeFor, uniqueEmail } from "./mailpit";

test("responses carry security headers", async ({ request }) => {
	const res = await request.get("/sign-in");
	const h = res.headers();
	expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
	expect(h["x-content-type-options"]).toBe("nosniff");
	expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
	expect(h["x-powered-by"]).toBeUndefined();
});

test("the session cookie is HttpOnly and SameSite=Lax", async ({ request }) => {
	const email = uniqueEmail("cookie");
	const origin = { Origin: "http://localhost:3100" };
	await request.post("/api/auth/email-otp/send-verification-otp", {
		headers: origin,
		data: { email, type: "sign-in" },
	});
	const res = await request.post("/api/auth/sign-in/email-otp", {
		headers: origin,
		data: { email, otp: await codeFor(email) },
	});
	expect(res.ok()).toBe(true);
	const session = res
		.headersArray()
		.filter((x) => x.name.toLowerCase() === "set-cookie")
		.map((x) => x.value)
		.find((c) => c.startsWith("cricket.session_token="));
	expect(session).toBeDefined();
	expect(session).toMatch(/HttpOnly/i);
	expect(session).toMatch(/SameSite=Lax/i);
});

test("cross-site auth requests are rejected", async ({ request }) => {
	const res = await request.post("/api/auth/email-otp/send-verification-otp", {
		headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
		data: { email: "victim@example.com", type: "sign-in" },
	});
	expect(res.status()).toBe(403);
});
