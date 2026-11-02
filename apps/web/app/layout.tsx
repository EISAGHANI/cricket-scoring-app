import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

/** Condensed display face for scoreboard numbers and headings. */
const barlow = Barlow_Condensed({
	variable: "--font-barlow",
	subsets: ["latin"],
	weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
	title: {
		default: "Crease - Cricket Scorer",
		template: "%s | Crease",
	},
	description:
		"Score cricket matches ball by ball: teams and squads, live scoring with extras and wickets, full scorecards and results. Works offline in your browser.",
	applicationName: "Crease",
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#0b5c37" },
		{ media: "(prefers-color-scheme: dark)", color: "#090e0b" },
	],
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang="en"
			className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} h-full antialiased`}
		>
			<body className="min-h-full font-sans">
				<AppShell>{children}</AppShell>
			</body>
		</html>
	);
}
