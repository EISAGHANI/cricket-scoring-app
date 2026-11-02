/**
 * Image uploads (M7, ADR-0015): validated and re-encoded on the server with sharp. Only resized
 * WebP variants are stored, which also strips metadata (EXIF location etc.).
 */
import { randomUUID } from "node:crypto";
import { authorize, type Action, type Resource } from "@cricket/authz";
import { schema } from "@cricket/db";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";
import { playerResource } from "@/features/players/service";
import { audit } from "@/lib/services/audit";
import type { ServiceContext } from "@/lib/services/context";
import { notFound, ServiceError } from "@/lib/services/errors";
import type { ObjectStore } from "@/lib/storage/s3";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request limit
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const VARIANT_SIZES = [512, 128] as const;

export type MediaOwner = "USER" | "PLAYER" | "TEAM" | "CLUB" | "ORGANIZATION";

export interface UploadedFile {
	bytes: Uint8Array;
	type: string;
}

const { mediaAssets, players, teams, clubs, organizations, users } = schema;

const invalid = (message: string) => new ServiceError("INVALID", message, { file: message });

async function ownerResource(
	ctx: ServiceContext,
	owner: MediaOwner,
	id: string,
): Promise<{ action: Action; resource: Resource }> {
	switch (owner) {
		case "USER":
			return { action: "user.update", resource: { type: "user", id } };
		case "PLAYER":
			return { action: "player.update", resource: await playerResource(ctx.db, id) };
		case "TEAM": {
			const [t] = await ctx.db
				.select({ clubId: teams.clubId })
				.from(teams)
				.where(and(eq(teams.id, id), isNull(teams.deletedAt)));
			if (t === undefined) throw notFound("Team");
			return { action: "team.update", resource: { type: "team", id, clubId: t.clubId } };
		}
		case "CLUB": {
			const [c] = await ctx.db
				.select({ id: clubs.id })
				.from(clubs)
				.where(and(eq(clubs.id, id), isNull(clubs.deletedAt)));
			if (c === undefined) throw notFound("Club");
			return { action: "club.update", resource: { type: "club", id } };
		}
		case "ORGANIZATION": {
			const [o] = await ctx.db
				.select({ id: organizations.id })
				.from(organizations)
				.where(and(eq(organizations.id, id), isNull(organizations.deletedAt)));
			if (o === undefined) throw notFound("Organisation");
			return { action: "organization.update", resource: { type: "organization", id } };
		}
	}
}

/** Resize to square WebP variants: avatars are cropped to fill, logos are fitted on transparency. */
export async function processImage(
	bytes: Uint8Array,
	kind: "AVATAR" | "LOGO",
): Promise<Map<number, Uint8Array>> {
	const out = new Map<number, Uint8Array>();
	try {
		const meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
		if (meta.width === undefined || meta.height === undefined) throw new Error("no dimensions");
		for (const size of VARIANT_SIZES) {
			const buf = await sharp(bytes, { limitInputPixels: 40_000_000 })
				.rotate()
				.resize(size, size, {
					fit: kind === "AVATAR" ? "cover" : "contain",
					background: { r: 0, g: 0, b: 0, alpha: 0 },
					withoutEnlargement: false,
				})
				.webp({ quality: 82 })
				.toBuffer();
			out.set(size, new Uint8Array(buf));
		}
	} catch {
		throw invalid("That file isn't an image we can read. Use a JPEG, PNG, WebP or AVIF.");
	}
	return out;
}

export async function uploadImage(
	ctx: ServiceContext,
	store: ObjectStore | null,
	owner: MediaOwner,
	ownerId: string,
	file: UploadedFile,
) {
	if (store === null)
		throw new ServiceError("INVALID", "Image uploads are not configured on this server.");
	const { action, resource } = await ownerResource(ctx, owner, ownerId);
	authorize(ctx.subject, action, resource);
	const subject = ctx.subject;
	if (file.bytes.byteLength === 0) throw invalid("Choose an image to upload.");
	if (file.bytes.byteLength > MAX_UPLOAD_BYTES) throw invalid("Images must be 4 MB or smaller.");
	if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type))
		throw invalid("Use a JPEG, PNG, WebP or AVIF image.");

	const kind = owner === "USER" || owner === "PLAYER" ? "AVATAR" : "LOGO";
	const variants = await processImage(file.bytes, kind);
	const base = `media/${owner.toLowerCase()}/${ownerId}/${randomUUID()}`;
	const keys: Record<string, string> = {};
	for (const [size, body] of variants) {
		const key = `${base}/${size}.webp`;
		await store.put(key, body, "image/webp");
		keys[String(size)] = key;
	}

	return ctx.db.transaction(async (tx) => {
		const [asset] = await tx
			.insert(mediaAssets)
			.values({
				ownerType: owner,
				ownerId,
				kind,
				key: base,
				mime: "image/webp",
				bytes: [...variants.values()].reduce((n, b) => n + b.byteLength, 0),
				status: "READY",
				variants: keys,
				createdBy: subject.userId,
			})
			.returning({ id: mediaAssets.id });
		const assetId = asset!.id;
		const url = store.publicUrl(keys["512"]!);
		switch (owner) {
			case "USER":
				await tx.update(users).set({ image: url }).where(eq(users.id, ownerId));
				break;
			case "PLAYER":
				await tx.update(players).set({ photoAssetId: assetId }).where(eq(players.id, ownerId));
				break;
			case "TEAM":
				await tx.update(teams).set({ logoAssetId: assetId }).where(eq(teams.id, ownerId));
				break;
			case "CLUB":
				await tx.update(clubs).set({ logoAssetId: assetId }).where(eq(clubs.id, ownerId));
				break;
			case "ORGANIZATION":
				await tx
					.update(organizations)
					.set({ logoAssetId: assetId })
					.where(eq(organizations.id, ownerId));
				break;
		}
		await audit(tx, {
			actorId: subject.userId,
			action: "media.upload",
			resourceType: owner.toLowerCase(),
			resourceId: ownerId,
			after: { assetId, kind },
			ip: ctx.ip ?? null,
		});
		return { assetId, url };
	});
}
