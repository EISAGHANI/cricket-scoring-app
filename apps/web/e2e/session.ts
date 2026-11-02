import { expect, type Page } from "@playwright/test";
import { codeFor, uniqueEmail } from "./mailpit";

/** Sign in through the UI with an email code; returns the email used. */
export async function signIn(page: Page, prefix = "user"): Promise<string> {
	const email = uniqueEmail(prefix);
	await page.goto("/sign-in");
	await signInAs(page, email);
	return email;
}

/** Complete the sign-in form (already open) for a given email, then expect `landing`. */
export async function signInAs(
	page: Page,
	email: string,
	landing: RegExp = /\/me$/,
): Promise<void> {
	await page.getByLabel("Email address").filter({ visible: true }).fill(email);
	await page.getByRole("button", { name: "Send me a code" }).click();
	await page
		.getByLabel("Code")
		.filter({ visible: true })
		.fill(await codeFor(email));
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page).toHaveURL(landing);
}
