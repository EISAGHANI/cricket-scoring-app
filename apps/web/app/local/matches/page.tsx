import type { Metadata } from "next";
import { MatchesScreen } from "@/features/matches/matches-screen";

export const metadata: Metadata = { title: "Matches" };

export default function MatchesPage() {
	return <MatchesScreen />;
}
