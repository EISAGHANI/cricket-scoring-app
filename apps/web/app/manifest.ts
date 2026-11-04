import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Crease - Cricket Scorer",
		short_name: "Crease",
		description: "Score cricket matches ball by ball, online or offline.",
		start_url: "/matches",
		scope: "/",
		display: "standalone",
		background_color: "#090e0b",
		theme_color: "#0b5c37",
		icons: [
			{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
			{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
		],
	};
}
