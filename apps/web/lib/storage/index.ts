import "server-only";
import { env } from "../env";
import { s3ObjectStore, type ObjectStore } from "./s3";

/** null when S3 isn't configured: uploads are then disabled with a clear message. */
export const objectStore: ObjectStore | null =
	env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_PUBLIC_URL
		? s3ObjectStore({
				endpoint: env.S3_ENDPOINT,
				region: env.S3_REGION,
				bucket: env.S3_BUCKET,
				accessKeyId: env.S3_ACCESS_KEY_ID,
				secretAccessKey: env.S3_SECRET_ACCESS_KEY,
				publicUrl: env.S3_PUBLIC_URL,
			})
		: null;

export type { ObjectStore };

/** Public URL of a stored variant ("512" or "128"), or null. */
export function mediaUrl(
	variants: Record<string, string> | null | undefined,
	size: "512" | "128",
): string | null {
	const key = variants?.[size];
	return key === undefined || objectStore === null ? null : objectStore.publicUrl(key);
}
