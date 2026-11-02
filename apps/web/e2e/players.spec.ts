import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./session";

const field = (page: Page, label: string) => page.getByLabel(label).filter({ visible: true });

async function createTeam(page: Page, name: string): Promise<string> {
	await page.goto("/teams/new");
	await field(page, "Team name").fill(name);
	await field(page, "Short name").fill("TST");
	await page.getByRole("button", { name: "Create team" }).click();
	await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
	return page.url();
}

test("squad building, captaincy and claiming a profile", async ({ page, browser }) => {
	const suffix = Date.now().toString(36);
	const playerName = `Jos Buttler ${suffix}`;
	await signIn(page, "manager");
	const teamUrl = await createTeam(page, `Claimers ${suffix}`);

	await field(page, "Add a player by name").fill(playerName);
	await field(page, "Role").selectOption("CAPTAIN");
	await page.getByRole("button", { name: "Add to squad" }).click();
	const squad = page.getByRole("region", { name: "Squad" });
	await expect(squad.getByRole("link", { name: playerName })).toBeVisible();
	await expect(squad.getByText("Captain · unclaimed")).toBeVisible();

	// Another user claims the unclaimed profile.
	const claimant = await browser.newPage({ viewport: { width: 375, height: 800 } });
	await signIn(claimant, "claimant");
	await claimant.goto(teamUrl);
	await claimant.getByRole("link", { name: playerName }).click();
	await claimant.getByLabel("Is this you? Ask to claim this profile").fill("It's me!");
	await claimant.getByRole("button", { name: "Claim this profile" }).click();
	await expect(claimant.getByText("Request sent")).toBeVisible();

	// The manager approves it from the team page.
	await page.reload();
	await expect(page.getByText(/says they are/)).toContainText(playerName);
	await page.getByRole("button", { name: "Approve" }).click();
	await expect(page.getByText(/says they are/)).toHaveCount(0);
	await expect(squad.getByText("Captain · unclaimed")).toHaveCount(0);

	// The claimant now owns the profile.
	await claimant.goto("/me");
	await claimant.getByRole("link", { name: "View player profile" }).click();
	await expect(claimant.getByRole("heading", { name: playerName })).toBeVisible();
	await expect(claimant.getByRole("link", { name: "Edit" })).toBeVisible();
	await claimant.close();
});

test("a minor's profile is restricted for strangers", async ({ page, browser }) => {
	const suffix = Date.now().toString(36);
	await signIn(page, "young");
	await page.goto("/players/new");
	await page
		.getByLabel("Name", { exact: true })
		.filter({ visible: true })
		.fill(`Young Prospect ${suffix}`);
	await field(page, "Date of birth").fill("2014-06-01");
	await page.getByRole("button", { name: "Create profile" }).click();
	await expect(page.getByRole("heading", { name: `Young Prospect ${suffix}` })).toBeVisible();
	const url = page.url();

	const stranger = await browser.newPage({ viewport: { width: 375, height: 800 } });
	await stranger.goto(url);
	await expect(stranger.getByRole("heading", { name: /^Y. Prospect/ })).toBeVisible();
	await expect(stranger.getByText("only visible to the player's teams")).toBeVisible();
	await stranger.close();
});
