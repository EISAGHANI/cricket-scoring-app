/** Integration tests: uploads are authorized, validated, re-encoded and recorded. */
import { Forbidden } from "@cricket/authz";
import { schema } from "@cricket/db";
import { createTestDb, resetDatabase } from "@cricket/db/testing";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createOwnProfile } from "@/features/players/service";
import { createTeam } from "@/features/teams/service";
import type { ObjectStore } from "@/lib/storage/s3";
import { as, makeUser } from "@/test/fixtures";
import { MAX_UPLOAD_BYTES, uploadImage } from "./service";

const { db, close } = createTestDb();
afterAll(close);
beforeEach(() => resetDatabase(db));

function memoryStore() {
	const objects = new Map<string, { body: Uint8Array; type: string }>();
	const store: ObjectStore = {
		async put(key, body, type) {
			objects.set(key, { body, type });
		},
		publicUrl: (key) => `https://cdn.example/${key}`,
	};
	return { store, objects };
}

async function png(width: number, height: number, withExif = false): Promise<Uint8Array> {
	let img = sharp({
		create: { width, height, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } },
	}).png();
	if (withExif) img = img.withExif({ IFD0: { Copyright: "secret-location" } });
	return new Uint8Array(await img.toBuffer());
}

describe("image uploads", () => {
	it("stores square WebP variants, strips metadata and links the asset to the player", async () => {
		const user = await makeUser(db);
		const player = await createOwnProfile(await as(db, user), { displayName: "Photo Player" });
		const { store, objects } = memoryStore();
		const result = await uploadImage(await as(db, user), store, "PLAYER", player.id, {
			bytes: await png(900, 600, true),
			type: "image/png",
		});
		expect(result.url).toMatch(/^https:\/\/cdn\.example\/media\/player\/.+\/512\.webp$/);
		expect([...objects.keys()].map((k) => k.split("/").pop()).sort()).toEqual([
			"128.webp",
			"512.webp",
		]);
		for (const [key, { body, type }] of objects) {
			expect(type).toBe("image/webp");
			const meta = await sharp(body).metadata();
			const size = Number(key.split("/").pop()!.replace(".webp", ""));
			expect([meta.format, meta.width, meta.height]).toEqual(["webp", size, size]);
			expect(meta.exif).toBeUndefined();
		}
		const [row] = await db.select().from(schema.players).where(eq(schema.players.id, player.id));
		expect(row!.photoAssetId).toBe(result.assetId);
	});

	it("team logos are fitted, not cropped; only the team's staff may upload", async () => {
		const manager = await makeUser(db);
		const team = await createTeam(await as(db, manager), { name: "Logos", shortName: "LOG" });
		const { store } = memoryStore();
		await expect(
			uploadImage(await as(db, await makeUser(db)), store, "TEAM", team.id, {
				bytes: await png(10, 10),
				type: "image/png",
			}),
		).rejects.toBeInstanceOf(Forbidden);
		await uploadImage(await as(db, manager), store, "TEAM", team.id, {
			bytes: await png(400, 100),
			type: "image/png",
		});
		const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, team.id));
		expect(row!.logoAssetId).not.toBeNull();
	});

	it("users can set their own account picture", async () => {
		const user = await makeUser(db);
		const { store } = memoryStore();
		const { url } = await uploadImage(await as(db, user), store, "USER", user, {
			bytes: await png(64, 64),
			type: "image/png",
		});
		const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user));
		expect(row!.image).toBe(url);
		await expect(
			uploadImage(await as(db, user), store, "USER", await makeUser(db), {
				bytes: await png(64, 64),
				type: "image/png",
			}),
		).rejects.toBeInstanceOf(Forbidden);
	});

	it("rejects empty, oversized, wrong-type and fake images; requires storage", async () => {
		const user = await makeUser(db);
		const ctx = await as(db, user);
		const { store, objects } = memoryStore();
		const reject = (bytes: Uint8Array, type: string) =>
			uploadImage(ctx, store, "USER", user, { bytes, type });
		await expect(reject(new Uint8Array(), "image/png")).rejects.toMatchObject({
			fieldErrors: { file: "Choose an image to upload." },
		});
		await expect(reject(new Uint8Array(MAX_UPLOAD_BYTES + 1), "image/png")).rejects.toMatchObject({
			code: "INVALID",
		});
		await expect(reject(await png(10, 10), "image/svg+xml")).rejects.toMatchObject({
			code: "INVALID",
		});
		await expect(
			reject(new TextEncoder().encode("<script>alert(1)</script>"), "image/png"),
		).rejects.toMatchObject({
			fieldErrors: { file: expect.stringContaining("isn't an image") },
		});
		expect(objects.size).toBe(0);
		await expect(
			uploadImage(ctx, null, "USER", user, { bytes: await png(10, 10), type: "image/png" }),
		).rejects.toMatchObject({
			message: "Image uploads are not configured on this server.",
		});
		await expect(
			uploadImage(ctx, store, "TEAM", "00000000-0000-7000-8000-000000000000", {
				bytes: await png(10, 10),
				type: "image/png",
			}),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});
