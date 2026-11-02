import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { signIn } from "./session";

async function pngBuffer(): Promise<Buffer> {
	return sharp({
		create: { width: 640, height: 480, channels: 3, background: { r: 11, g: 92, b: 55 } },
	})
		.png()
		.toBuffer();
}

test("upload a player photo and see it on the profile", async ({ page }) => {
	const suffix = Date.now().toString(36);
	await signIn(page, "photo");
	await page.goto("/players/new");
	await page
		.getByLabel("Name", { exact: true })
		.filter({ visible: true })
		.fill(`Photo Player ${suffix}`);
	await page.getByRole("button", { name: "Create profile" }).click();
	await expect(page.getByRole("heading", { name: `Photo Player ${suffix}` })).toBeVisible();

	await page.getByRole("link", { name: "Edit" }).click();
	await page
		.getByLabel(/^Photo/)
		.filter({ visible: true })
		.setInputFiles({ name: "me.png", mimeType: "image/png", buffer: await pngBuffer() });
	await page.getByRole("button", { name: "Upload" }).click();
	await expect(page.getByText("Uploaded.")).toBeVisible();

	await page.goto(page.url().replace(/\/edit$/, ""));
	const img = page.locator("main img").first();
	await expect(img).toHaveAttribute("src", /\/media\/player\/.+\/512\.webp$/);
	await expect
		.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
		.toBe(512);
});

test("non-images are rejected with a message", async ({ page }) => {
	await signIn(page, "fake-image");
	await page.goto("/me");
	await page
		.getByLabel("Account picture")
		.filter({ visible: true })
		.setInputFiles({
			name: "evil.png",
			mimeType: "image/png",
			buffer: Buffer.from("<script>alert(1)</script>"),
		});
	await page.getByRole("button", { name: "Upload" }).click();
	await expect(page.getByText("isn't an image we can read").first()).toBeVisible();
});
