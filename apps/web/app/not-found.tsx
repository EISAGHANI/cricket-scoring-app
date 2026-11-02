import { SearchX } from "lucide-react";
import { EmptyState, LinkButton } from "@/components/ui";

export default function NotFound() {
	return (
		<EmptyState
			icon={<SearchX className="size-8" aria-hidden="true" />}
			title="Page not found"
			action={<LinkButton href="/">Back home</LinkButton>}
		>
			That page doesn&apos;t exist.
		</EmptyState>
	);
}
