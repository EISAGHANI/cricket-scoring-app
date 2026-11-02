import type { Metadata } from "next";
import { NewMatchWizard } from "@/features/matches/new-match-wizard";

export const metadata: Metadata = { title: "New match" };

export default function NewMatchPage() {
	return <NewMatchWizard />;
}
