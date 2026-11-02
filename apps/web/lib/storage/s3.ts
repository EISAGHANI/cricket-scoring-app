import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Where processed media goes. The service layer depends on this interface, not on S3. */
export interface ObjectStore {
	put(key: string, body: Uint8Array, contentType: string): Promise<void>;
	publicUrl(key: string): string;
}

export interface S3Config {
	endpoint: string | undefined;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	publicUrl: string;
}

export function s3Client(c: S3Config): S3Client {
	return new S3Client({
		region: c.region,
		// RustFS / MinIO need path-style URLs; R2 and AWS accept them too.
		forcePathStyle: true,
		...(c.endpoint === undefined ? {} : { endpoint: c.endpoint }),
		credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
	});
}

export function s3ObjectStore(c: S3Config): ObjectStore {
	const client = s3Client(c);
	return {
		async put(key, body, contentType) {
			await client.send(
				new PutObjectCommand({
					Bucket: c.bucket,
					Key: key,
					Body: body,
					ContentType: contentType,
					CacheControl: "public, max-age=31536000, immutable",
				}),
			);
		},
		publicUrl: (key) => `${c.publicUrl.replace(/\/$/, "")}/${key}`,
	};
}
