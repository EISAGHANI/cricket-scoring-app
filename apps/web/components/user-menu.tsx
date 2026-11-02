import Link from "next/link";
import { CircleUserRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";

const linkClass =
	"flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:text-ink";

/** Header account link. Reads the session, so it renders inside a Suspense boundary. */
export async function UserMenu() {
	const user = await getCurrentUser();
	if (user === null) {
		return (
			<Link href="/sign-in" className={linkClass}>
				Sign in
			</Link>
		);
	}
	return (
		<Link href="/me" className={linkClass} aria-label="Your account">
			<CircleUserRound className="size-5" aria-hidden="true" />
			<span className="max-w-32 truncate">{user.name || "Account"}</span>
		</Link>
	);
}

export function UserMenuFallback() {
	return <span className="block h-9 w-20" aria-hidden="true" />;
}
