import { expect, test, type Page } from "@playwright/test";
import { latestMessage, uniqueEmail } from "./mailpit";
import { signIn, signInAs } from "./session";

const field = (page: Page, label: string) => page.getByLabel(label).filter({ visible: true });

test("invite by email, accept, and join requests", async ({ page, browser }) => {
	const suffix = Date.now().toString(36);
	await signIn(page, "inviter");
	await page.goto("/teams/new");
	await field(page, "Team name").fill(`Inviters ${suffix}`);
	await field(page, "Short name").fill("INV");
	await page.getByRole("button", { name: "Create team" }).click();
	await expect(page.getByRole("heading", { name: new RegExp(`Inviters ${suffix}`) })).toBeVisible();
	const teamUrl = page.url();

	// Invite by email; the link arrives in the dev mailbox.
	const invitee = uniqueEmail("invitee");
	await field(page, "Email address").fill(invitee);
	await page.getByRole("button", { name: "Send invitation" }).click();
	await expect(page.getByText("Invitation sent.")).toBeVisible();
	await expect(page.getByText(`${invitee}`)).toBeVisible();
	const mail = await latestMessage(invitee);
	const link = /https?:\/\/\S+\/invitations\/[A-Za-z0-9_-]+/.exec(mail.Snippet)?.[0];
	expect(link).toBeDefined();

	// Someone else cannot use the forwarded link.
	const wrong = await browser.newPage({ viewport: { width: 375, height: 800 } });
	await signIn(wrong, "forwarded");
	await wrong.goto(link!);
	await wrong.getByRole("button", { name: "Accept and join the squad" }).click();
	await expect(
		wrong.getByRole("alert").filter({ hasText: "Sign in with that account" }),
	).toBeVisible();

	// The invitee signs in (from the invitation) and joins.
	const right = await browser.newPage({ viewport: { width: 375, height: 800 } });
	await right.goto(link!);
	await right.getByRole("link", { name: "Sign in to accept" }).click();
	await signInAs(right, invitee, /\/invitations\//);
	await right.getByRole("button", { name: "Accept and join the squad" }).click();
	await expect(right).toHaveURL(teamUrl);
	await expect(right.getByRole("region", { name: "Squad" }).getByRole("link")).toHaveCount(1);
	await right.goto(link!);
	await expect(right.getByRole("heading", { name: "Invitation accepted" })).toBeVisible();

	// A third user asks to join; the manager accepts.
	await wrong.goto(teamUrl);
	await wrong.getByRole("button", { name: "Ask to join this team" }).click();
	await field(wrong, "Message to the team (optional)").fill("Keen leg-spinner");
	await wrong.getByRole("button", { name: "Send request" }).click();
	await expect(wrong.getByText("waiting for the team's staff")).toBeVisible();
	await page.reload();
	await expect(page.getByText("Keen leg-spinner")).toBeVisible();
	await page.getByRole("button", { name: "Accept" }).click();
	await expect(page.getByRole("region", { name: "Squad" }).getByRole("link")).toHaveCount(2);
	await wrong.close();
	await right.close();
});
