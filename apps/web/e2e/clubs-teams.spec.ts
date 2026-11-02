import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./session";

/** Next.js keeps previously visited routes in the DOM (hidden); only match visible fields. */
const field = (page: Page, label: string) => page.getByLabel(label).filter({ visible: true });

test("create a club, add a team, edit it; others can view but not edit", async ({
	page,
	browser,
}) => {
	const suffix = Date.now().toString(36);
	await signIn(page, "club-admin");

	await page.goto("/clubs/new");
	await field(page, "Club name").fill(`Riverside ${suffix}`);
	await page.getByRole("button", { name: "Create club" }).click();
	await expect(page).toHaveURL(new RegExp(`/clubs/riverside-${suffix}$`));
	await expect(page.getByRole("heading", { name: `Riverside ${suffix}` })).toBeVisible();

	await page.getByRole("link", { name: "Add team" }).click();
	await expect(page.getByText(`Club: Riverside ${suffix}`)).toBeVisible();
	await field(page, "Team name").fill(`Riverside First XI ${suffix}`);
	await field(page, "Short name").fill("rfx");
	await page.getByRole("button", { name: "Create team" }).click();
	await expect(page.getByRole("heading", { name: /Riverside First XI/ })).toContainText("RFX");

	await page.getByRole("link", { name: "Edit" }).click();
	await field(page, "Category").selectOption("WOMEN");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText(/· Women/)).toBeVisible();
	const teamUrl = page.url();

	// The club page lists the new team straight away (cache tags updated by the action).
	await page.getByRole("link", { name: `Riverside ${suffix}` }).click();
	await expect(page.getByRole("link", { name: /Riverside First XI/ })).toBeVisible();

	// Validation errors stay on the form.
	await page.goto("/teams/new");
	await field(page, "Team name").fill("Short name test");
	await field(page, "Short name").fill("bad!");
	await page.getByRole("button", { name: "Create team" }).click();
	await expect(page.getByText("1–6 letters or digits")).toBeVisible();

	// Another user sees the team without edit controls and cannot open the edit page.
	const other = await browser.newPage({ viewport: { width: 375, height: 800 } });
	await signIn(other, "stranger");
	await other.goto(teamUrl);
	await expect(other.getByRole("heading", { name: /Riverside First XI/ })).toBeVisible();
	await expect(other.getByRole("link", { name: "Edit" })).toHaveCount(0);
	await other.goto(`${teamUrl}/edit`);
	await expect(other.getByRole("heading", { name: "Not allowed" })).toBeVisible();
	await other.close();
});

test("search finds clubs and escapes wildcards", async ({ page }) => {
	await page.goto("/clubs?q=%25%25no-such-club");
	await expect(page.getByRole("heading", { name: "No matching clubs" })).toBeVisible();
});
