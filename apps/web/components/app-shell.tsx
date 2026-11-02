import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Logo } from "./logo";
import { NAV } from "./nav-config";
import { NavLinks } from "./nav-links";
import { UserMenu, UserMenuFallback } from "./user-menu";

/**
 * Header (desktop links) and bottom tab bar (phones). The links highlight the
 * active route with `usePathname`, which suspends during prerender on dynamic
 * routes, so they sit in a Suspense boundary whose fallback is the same links
 * without the highlight.
 */
export function AppShell({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-dvh flex-col">
			<header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-md">
				<div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
					<Link href="/" className="flex items-center gap-2.5" aria-label="Crease home">
						<Logo className="size-9" />
						<span className="font-display text-2xl font-bold uppercase tracking-wider">Crease</span>
					</Link>
					<div className="flex items-center gap-1">
						<nav aria-label="Main" className="hidden sm:block">
							<Suspense fallback={<StaticLinks variant="top" />}>
								<NavLinks variant="top" />
							</Suspense>
						</nav>
						<Suspense fallback={<UserMenuFallback />}>
							<UserMenu />
						</Suspense>
					</div>
				</div>
			</header>

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 sm:pb-12">{children}</main>

			<nav
				aria-label="Main"
				className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
			>
				<Suspense fallback={<StaticLinks variant="bottom" />}>
					<NavLinks variant="bottom" />
				</Suspense>
			</nav>
		</div>
	);
}

function StaticLinks({ variant }: { variant: "top" | "bottom" }) {
	return (
		<ul className={variant === "top" ? "flex gap-1" : "grid grid-cols-4"}>
			{NAV.map(({ href, label, Icon }) => (
				<li key={href}>
					<Link
						href={href}
						className={
							variant === "top"
								? "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:text-ink"
								: "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-muted"
						}
					>
						<Icon className="size-5" aria-hidden="true" />
						{label}
					</Link>
				</li>
			))}
		</ul>
	);
}
