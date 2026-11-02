import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState, LinkButton } from "@/components/ui";

export function NotAllowed({ backHref, children }: { backHref: string; children: ReactNode }) {
	return (
		<EmptyState
			icon={<Lock className="size-8" aria-hidden="true" />}
			title="Not allowed"
			action={<LinkButton href={backHref}>Go back</LinkButton>}
		>
			{children}
		</EmptyState>
	);
}
