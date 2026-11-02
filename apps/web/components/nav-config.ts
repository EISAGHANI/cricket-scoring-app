import { Building2, House, ListOrdered, Shield } from "lucide-react";

/** Shared by the server-rendered fallback and the client active-link nav. */
export const NAV = [
	{ href: "/", label: "Home", Icon: House },
	{ href: "/teams", label: "Teams", Icon: Shield },
	{ href: "/clubs", label: "Clubs", Icon: Building2 },
	// The local-first scorer until Phase 3 brings server-backed matches.
	{ href: "/local/matches", label: "Score", Icon: ListOrdered },
] as const;
