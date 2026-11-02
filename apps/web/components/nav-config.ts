import { CirclePlus, House, ListOrdered, Users } from "lucide-react";

/** Shared by the server-rendered fallback and the client active-link nav. */
export const NAV = [
	{ href: "/", label: "Home", Icon: House },
	{ href: "/matches/new", label: "New match", Icon: CirclePlus },
	{ href: "/matches", label: "Matches", Icon: ListOrdered },
	{ href: "/teams", label: "Teams", Icon: Users },
] as const;
