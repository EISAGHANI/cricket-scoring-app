import { expect, test } from "@playwright/test";
import { codeFor, uniqueEmail } from "./mailpit";

test("sign in with an email code, set a name, sign out", async ({ page }) => {
	const email = uniqueEmail("e2e");
	await page.goto("/me");
	await expect(page).toHaveURL(/\/sign-in\?next=%2Fme/);

	await page.getByLabel("Email address").fill(email);
	await page.getByRole("button", { name: "Send me a code" }).click();
	await page.getByLabel("Code").fill(await codeFor(email));
	await page.getByRole("button", { name: "Sign in" }).click();

	await expect(page).toHaveURL(/\/me$/);
	await expect(page.getByRole("definition").filter({ hasText: email })).toBeVisible();
	await expect(page.getByRole("status").filter({ hasText: "Welcome" })).toBeVisible();

	await page.getByLabel("Your name").fill("Ellyse Perry");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Your account" })).toContainText("Ellyse Perry");

	await page.getByRole("button", { name: "Sign out" }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("a wrong code is rejected with a message", async ({ page }) => {
	const email = uniqueEmail("e2e-wrong");
	await page.goto("/sign-in");
	await page.getByLabel("Email address").fill(email);
	await page.getByRole("button", { name: "Send me a code" }).click();
	await codeFor(email);
	await page.getByLabel("Code").fill("000000");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByRole("alert")).toBeVisible();
});

test("sign in with a phone code", async ({ page }) => {
	const digits = `4477009${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`;
	await page.goto("/sign-in");
	await page.getByRole("radio", { name: "Phone" }).click();
	await page.getByLabel("Mobile number").fill(`+${digits}`);
	await page.getByRole("button", { name: "Send me a code" }).click();
	await page.getByLabel("Code").fill(await codeFor(`sms+${digits}@sms.local`));
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page).toHaveURL(/\/me$/);
	await expect(page.getByRole("definition").filter({ hasText: `+${digits}` })).toBeVisible();
});
