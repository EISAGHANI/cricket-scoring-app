import { expect, test } from "@playwright/test";

/** Runs against the seeded dev database (pnpm --filter @cricket/web db:seed --reset). */
test.skip(!!process.env.CI, "the CI database is not seeded");

test("seeded pages are populated", async ({ page }) => {
	await page.goto("/clubs?q=Riverside Cricket Club");
	await page.getByRole("link", { name: "Riverside Cricket Club" }).click();
	await expect(page.getByRole("link", { name: /Riverside First XI/ })).toBeVisible();
	await page.getByRole("link", { name: /Riverside Under-15s/ }).click();
	const squad = page.getByRole("region", { name: "Squad" });
	await expect(squad.getByRole("link")).toHaveCount(15);
	// Minors without guardian consent are shown as initial + surname to visitors.
	await expect(squad.getByRole("link", { name: /^[A-Z]\. \S+$/ }).first()).toBeVisible();
	// Seeded matches: results, a live chase and an upcoming fixture.
	await page.goto("/matches");
	await expect(page.getByRole("heading", { name: "Live" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Recent results" })).toBeVisible();
	await page
		.getByRole("link", { name: /need \d+ from \d+ balls/ })
		.first()
		.click();
	await expect(page.getByRole("region", { name: "Score" })).toBeVisible();
	await page.goto("/organizations/metro");
	await expect(page.getByRole("heading", { name: "Metro Cricket League" })).toBeVisible();
});
