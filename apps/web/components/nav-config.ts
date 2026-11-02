import { CirclePlus, House, ListOrdered, Users } from "lucide-react";

/** Shared by the server-rendered fallback and the client active-link nav. */
export const NAV = [
	{ href: "/", label: "Home", Icon: House },
	{ href: "/local/matches/new", label: "New match", Icon: CirclePlus },
	{ href: "/local/matches", label: "Matches", Icon: ListOrdered },
	{ href: "/local/teams", label: "Teams", Icon: Users },
] as const;
