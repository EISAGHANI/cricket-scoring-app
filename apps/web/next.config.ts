import type { NextConfig } from "next";
// Validate env at config load so dev/build fail fast on bad configuration.
import { env } from "./lib/env";
import { securityHeaders } from "./lib/security-headers";

const media = env.S3_PUBLIC_URL === undefined ? null : new URL(env.S3_PUBLIC_URL);

const nextConfig: NextConfig = {
	cacheComponents: true,
	poweredByHeader: false,
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: securityHeaders({
					appUrl: env.NEXT_PUBLIC_APP_URL,
					mediaUrl: env.S3_PUBLIC_URL,
					dev: env.NODE_ENV === "development",
				}),
			},
		];
	},
	partialPrefetching: true,
	images: {
		// Uploaded media is already resized WebP (features/media), served from the bucket/CDN.
		remotePatterns:
			media === null
				? []
				: [
						{
							protocol: media.protocol.replace(":", "") as "http" | "https",
							hostname: media.hostname,
							port: media.port,
							pathname: `${media.pathname.replace(/\/$/, "")}/**`,
						},
					],
	},
	experimental: {
		// Image uploads go through Server Actions (ADR-0015): 4 MB files plus multipart overhead.
		serverActions: { bodySizeLimit: "5mb" },
	},
	turbopack: {
		rules: {
			"*.css": {
				loaders: ["@tailwindcss/turbopack"],
				as: "*.css",
			},
		},
	},
};

export default nextConfig;
