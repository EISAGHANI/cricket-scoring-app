"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav-config";
import { cx } from "./ui";

function isActive(pathname: string, href: string) {
	if (href === "/") return pathname === "/";
	if (href === "/matches")
		return (
			pathname === "/matches" || (pathname.startsWith("/matches/") && pathname !== "/matches/new")
		);
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ variant }: { variant: "top" | "bottom" }) {
	const pathname = usePathname();
	return (
		<ul className={variant === "top" ? "flex gap-1" : "grid grid-cols-4"}>
			{NAV.map(({ href, label, Icon }) => {
				const active = isActive(pathname, href);
				return (
					<li key={href}>
						<Link
							href={href}
							aria-current={active ? "page" : undefined}
							className={
								variant === "top"
									? cx(
											"flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
											active ? "bg-brand-soft text-brand" : "text-muted hover:text-ink",
										)
									: cx(
											"flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition",
											active ? "text-brand" : "text-muted",
										)
							}
						>
							<Icon className="size-5" aria-hidden="true" />
							{label}
						</Link>
					</li>
				);
			})}
		</ul>
	);
}
