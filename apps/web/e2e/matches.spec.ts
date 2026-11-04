import { expect, test, type Page } from "@playwright/test";
import { codeFor } from "./mailpit";
import { signIn, signInAs } from "./session";

/** Next.js keeps previously visited routes in the DOM (hidden); only match visible fields. */
const field = (page: Page, label: string | RegExp) =>
	page.getByLabel(label).filter({ visible: true });
const button = (page: Page, name: string | RegExp) =>
	page.getByRole("button", { name, exact: typeof name === "string" });

async function createTeam(page: Page, name: string, shortName: string) {
	await page.goto("/teams/new");
	await field(page, "Team name").fill(name);
	await field(page, "Short name").fill(shortName);
	await button(page, "Create team").click();
	await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
}

async function addGuests(page: Page, names: string[]) {
	for (const name of names) {
		await field(page, "Add a guest player").fill(name);
		await page.getByRole("button", { name: "Add", exact: true }).click();
		await expect(page.getByRole("button", { name: new RegExp(name) }).first()).toBeVisible();
	}
	await page.getByRole("button", { name: `Captain: ${names[0]}` }).click();
	await page.getByRole("button", { name: `Wicket-keeper: ${names[1]}` }).click();
	await expect(page.getByText(`${names.length}/${names.length} picked`)).toBeVisible();
}

test("set up a match, score it to a result, and a second browser follows it live", async ({
	page,
	browser,
}) => {
	test.setTimeout(120_000);
	const s = Date.now().toString(36);
	const scorerEmail = await signIn(page, "scorer");
	await createTeam(page, `Lions ${s}`, "LIO");
	await createTeam(page, `Tigers ${s}`, "TIG");

	// M3: the setup wizard (two a side, one over, guest players).
	await page.goto("/matches/new");
	await field(page, /Your team/).selectOption({ label: `Lions ${s}` });
	await field(page, /Opponent/).selectOption({ label: `Tigers ${s}` });
	await button(page, "Next").click();
	await page.getByRole("button", { name: /Custom/ }).click();
	await field(page, "Overs per side").fill("1");
	await field(page, "Players per side").fill("2");
	await button(page, "Next").click();
	await addGuests(page, [`Ann ${s}`, `Bea ${s}`]);
	await button(page, "Next").click();
	await addGuests(page, [`Dan ${s}`, `Eve ${s}`]);
	await button(page, "Next").click();
	await field(page, "Umpire 1").fill("Dickie Bird");
	await button(page, "Create match").click();
	await expect(page).toHaveURL(/\/matches\/[0-9a-f-]{36}$/);
	const matchUrl = page.url();
	await expect(page.getByRole("heading", { name: `Lions ${s} v Tigers ${s}` })).toBeVisible();
	await expect(page.getByText("Dickie Bird")).toBeVisible();

	// A signed-out viewer opens the match page before play starts.
	const viewer = await browser.newPage({ viewport: { width: 375, height: 800 } });
	await viewer.goto(matchUrl);
	await expect(viewer.getByText(/Waiting for the first ball/)).toBeVisible();
	await expect(viewer.getByRole("link", { name: "Score" })).toHaveCount(0);

	// A second viewer whose socket is blocked must fall back to polling.
	const polled = await browser.newPage({ viewport: { width: 375, height: 800 } });
	await polled.route("**/socket.io/**", (route) => route.abort());
	await polled.routeWebSocket(/socket\.io/, (ws) => void ws.close());
	await polled.goto(matchUrl);
	await expect(polled.getByText(/Waiting for the first ball/)).toBeVisible();

	// M4: the scorer pad.
	await page.getByRole("link", { name: "Score" }).click();
	await button(page, "Start scoring").click();
	await page.getByRole("button", { name: `Lions ${s}` }).click();
	await button(page, "Record toss").click();
	await expect(page.getByRole("heading", { name: `Lions ${s} to bat` })).toBeVisible();
	await page.getByRole("button", { name: `Dan ${s}` }).click();
	await button(page, "Start innings").click();
	await expect(page.getByText("Saved")).toBeVisible();

	// M6: a second device of the same scorer. It can't score while the first holds the lock, and
	// goes read-only; the first hands over, the second scores and its pending entry is saved.
	const scorerUrl = page.url();
	const second = await browser.newPage({ viewport: { width: 375, height: 800 } });
	await second.goto("/sign-in");
	await signInAs(second, scorerEmail, /\/me$/, await codeFor(scorerEmail));
	await second.goto(scorerUrl);
	await button(second, "Four").click();
	await expect(second.getByText(/Read-only · 1 pending/)).toBeVisible();
	await button(page, "Hand over").click();
	await expect(page.getByText("Read-only")).toBeVisible();
	await button(second, "Take the lock").click();
	await expect(second.getByText("Saved")).toBeVisible();
	await expect(page.getByRole("region", { name: "Score" })).toContainText("4/0", {
		timeout: 15_000,
	});
	await button(second, "Hand over").click();
	await button(page, "Take the lock").click();
	await expect(page.getByText("Saved")).toBeVisible();
	await second.close();
	await button(page, "1 run").click();
	await button(page, "Wide").click();
	await page.getByRole("button", { name: /^Wd 1 run/ }).click();
	await button(page, "2 runs").click();
	const score = page.getByRole("region", { name: "Score" });
	await expect(score).toContainText("8/0");
	await button(page, "Undo last entry").click();
	await expect(score).toContainText("6/0");
	await expect(page.getByText("Saved")).toBeVisible();

	// The socket viewer sees the balls at once (well inside the 5 s poll interval); the one
	// with a blocked socket catches up by polling.
	await expect(viewer.getByRole("region", { name: "Score" })).toContainText("6/0", {
		timeout: 3_000,
	});
	await expect(viewer.getByRole("status").filter({ hasText: /^Live$/ })).toBeVisible();
	await expect(polled.getByRole("region", { name: "Score" })).toContainText("6/0", {
		timeout: 15_000,
	});
	await expect(polled.getByText("Updates every few seconds")).toBeVisible();
	await polled.close();

	// A wicket with two a side ends the innings.
	await button(page, "Out").click();
	await button(page, "Record wicket").click();
	await expect(page.getByText("Innings break")).toBeVisible();
	await expect(page.getByRole("heading", { name: `Tigers ${s} to bat` })).toBeVisible();
	await page
		.getByRole("button", { name: `Ann ${s}` })
		.last()
		.click();
	await button(page, "Start innings").click();
	await expect(score).toContainText("Need 7 runs from 6 balls");
	await button(page, "Six").click();
	await button(page, "1 run").click();
	await expect(page.getByRole("heading", { name: /Tigers .* won by 1 wicket/ })).toBeVisible();
	await button(page, "Confirm result").click();
	await expect(page.getByText(/won by 1 wicket \(4 balls left\)/)).toBeVisible();
	await expect(page.getByText("Saved")).toBeVisible();

	// The scorecard tab.
	await page.getByRole("radio", { name: "Scorecard" }).click();
	await expect(page.getByRole("table").first()).toContainText(`Ann ${s}`);
	await expect(page.getByText(/b Dan/).first()).toBeVisible();

	// M5: the viewer sees the result, the scorecard and the commentary.
	await expect(viewer.getByText(/won by 1 wicket/).first()).toBeVisible({ timeout: 15_000 });
	await viewer.getByRole("radio", { name: "Commentary" }).click();
	await expect(viewer.getByRole("list", { name: "Ball by ball commentary" })).toContainText(
		"FOUR!",
	);
	await expect(viewer.getByRole("list", { name: "Ball by ball commentary" })).toContainText("SIX!");

	// Lists: the match is under recent results.
	await viewer.goto("/matches");
	await expect(
		viewer.getByRole("link", { name: new RegExp(`Lions ${s}.*Tigers ${s}`) }),
	).toBeVisible();
	await viewer.close();
});

test("only the match's scorers can score", async ({ page }) => {
	const s = Date.now().toString(36);
	await signIn(page, "owner");
	await createTeam(page, `Hawks ${s}`, "HAW");
	await createTeam(page, `Owls ${s}`, "OWL");
	await page.goto("/matches/new");
	await field(page, /Your team/).selectOption({ label: `Hawks ${s}` });
	await field(page, /Opponent/).selectOption({ label: `Owls ${s}` });
	await button(page, "Next").click();
	await page.getByRole("button", { name: /Custom/ }).click();
	await field(page, "Players per side").fill("2");
	await button(page, "Next").click();
	await addGuests(page, [`Ho ${s}`, `Hu ${s}`]);
	await button(page, "Next").click();
	await addGuests(page, [`Oa ${s}`, `Ob ${s}`]);
	await button(page, "Next").click();
	await button(page, "Create match").click();
	await expect(page).toHaveURL(/\/matches\/[0-9a-f-]{36}$/);
	const scoreUrl = `${page.url()}/score`;

	await page.context().clearCookies();
	await signIn(page, "stranger");
	await page.goto(scoreUrl);
	await expect(page.getByText(/Only the match's creator and the scorers/)).toBeVisible();
	// The API refuses a well-formed event from a non-scorer, and any cross-origin request.
	const matchId = scoreUrl.split("/").at(-2)!;
	const api = `/api/matches/${matchId}/events`;
	const data = {
		matchId,
		event: { id: crypto.randomUUID(), seq: 1, type: "SWAP_STRIKE", payload: { reason: "x" } },
		deviceId: "e2e",
		clientTimestamp: new Date().toISOString(),
		schemaVersion: 1,
	};
	const origin = new URL(scoreUrl).origin;
	const forbidden = await page.request.post(api, { headers: { Origin: origin }, data });
	expect(forbidden.status()).toBe(403);
	const cross = await page.request.post(api, { headers: { Origin: "https://evil.example" }, data });
	expect(cross.status()).toBe(403);
	expect(await cross.json()).toMatchObject({ error: "Cross-origin request" });
	const events = await page.request.get(`${api}?after=0`);
	expect(await events.json()).toMatchObject({ lastSeq: 0, events: [] });
});
