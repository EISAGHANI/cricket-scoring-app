import type { NextConfig } from "next";
// Validate env at config load so dev/build fail fast on bad configuration.
import "./lib/env";

const nextConfig: NextConfig = {
	cacheComponents: true,
	partialPrefetching: true,
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
