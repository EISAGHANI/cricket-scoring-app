import { Building2, House, Shield, Swords } from "lucide-react";

/** Shared by the server-rendered fallback and the client active-link nav. */
export const NAV = [
	{ href: "/", label: "Home", Icon: House },
	{ href: "/matches", label: "Matches", Icon: Swords },
	{ href: "/teams", label: "Teams", Icon: Shield },
	{ href: "/clubs", label: "Clubs", Icon: Building2 },
] as const;
