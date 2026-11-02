/**
 * Create the media bucket and allow public reads of processed images under media/.
 * Usage: pnpm --filter @cricket/web storage:init   (reads apps/web/.env.local)
 */
import { CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../lib/storage/s3";

const bucket = process.env.S3_BUCKET;
const cfg = {
	endpoint: process.env.S3_ENDPOINT,
	region: process.env.S3_REGION ?? "us-east-1",
	bucket: bucket ?? "",
	accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
	secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
	publicUrl: process.env.S3_PUBLIC_URL ?? "",
};
if (!bucket || !cfg.accessKeyId) {
	console.error("S3_BUCKET and S3 credentials are required");
	process.exit(1);
}
const client = s3Client(cfg);
try {
	await client.send(new HeadBucketCommand({ Bucket: bucket }));
	console.log(`Bucket ${bucket} exists`);
} catch {
	await client.send(new CreateBucketCommand({ Bucket: bucket }));
	console.log(`Created bucket ${bucket}`);
}
await client.send(
	new PutBucketPolicyCommand({
		Bucket: bucket,
		Policy: JSON.stringify({
			Version: "2012-10-17",
			Statement: [
				{
					Sid: "PublicReadProcessedMedia",
					Effect: "Allow",
					Principal: { AWS: ["*"] },
					Action: ["s3:GetObject"],
					Resource: [`arn:aws:s3:::${bucket}/media/*`],
				},
			],
		}),
	}),
);
console.log("Public read enabled for media/*");
