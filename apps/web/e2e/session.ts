import { expect, type Page } from "@playwright/test";
import { codeFor, uniqueEmail } from "./mailpit";

/** Sign in through the UI with an email code; returns the email used. */
export async function signIn(page: Page, prefix = "user"): Promise<string> {
	const email = uniqueEmail(prefix);
	await page.goto("/sign-in");
	await page.getByLabel("Email address").filter({ visible: true }).fill(email);
	await page.getByRole("button", { name: "Send me a code" }).click();
	await page
		.getByLabel("Code")
		.filter({ visible: true })
		.fill(await codeFor(email));
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page).toHaveURL(/\/me$/);
	return email;
}
