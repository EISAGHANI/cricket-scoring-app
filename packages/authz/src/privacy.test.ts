import { describe, expect, it } from "vitest";
import { ageOn, initialName, isMinor, playerView } from "./privacy";

const TODAY = "2026-11-02";
const adult = {
	displayName: "Joe Root",
	dateOfBirth: "1990-12-30",
	photoUrl: "/p.webp",
	visibility: "PUBLIC" as const,
	guardianConsent: false,
};
const minor = { ...adult, displayName: "Sam Young", dateOfBirth: "2012-05-01" };

describe("privacy", () => {
	it("computes age in whole years around the birthday", () => {
		expect(ageOn("2008-11-02", TODAY)).toBe(18);
		expect(ageOn("2008-11-03", TODAY)).toBe(17);
		expect(ageOn("2008-10-31", TODAY)).toBe(18);
		expect(ageOn("2008-12-01", TODAY)).toBe(17);
		expect(isMinor(null, TODAY)).toBe(false);
		expect(isMinor("2012-05-01", TODAY)).toBe(true);
	});

	it("shortens names to initial and surname", () => {
		expect(initialName("joe root")).toBe("J. root");
		expect(initialName("  Mahendra Singh Dhoni ")).toBe("M. Singh Dhoni");
		expect(initialName("Sachin")).toBe("S.");
	});

	it("shows adults publicly without their date of birth", () => {
		expect(playerView(adult, false, TODAY)).toEqual({
			displayName: "Joe Root",
			dateOfBirth: null,
			photoUrl: "/p.webp",
			restricted: false,
		});
	});

	it("restricts minors without guardian consent, unless the viewer may see private data", () => {
		expect(playerView(minor, false, TODAY)).toEqual({
			displayName: "S. Young",
			dateOfBirth: null,
			photoUrl: null,
			restricted: true,
		});
		expect(playerView({ ...minor, guardianConsent: true }, false, TODAY).restricted).toBe(false);
		expect(playerView(minor, true, TODAY)).toEqual({
			displayName: "Sam Young",
			dateOfBirth: "2012-05-01",
			photoUrl: "/p.webp",
			restricted: false,
		});
	});

	it("restricts team-only profiles", () => {
		expect(playerView({ ...adult, visibility: "PRIVATE_TO_TEAM" }, false, TODAY).restricted).toBe(
			true,
		);
	});
});
