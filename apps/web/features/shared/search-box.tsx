import { Search } from "lucide-react";
import { inputClass } from "@/components/ui";

/** Plain GET form: works without JavaScript, and the URL is shareable. */
export function SearchBox({
	placeholder,
	defaultValue,
}: {
	placeholder: string;
	defaultValue: string;
}) {
	return (
		<form role="search" className="relative mb-5">
			<Search
				className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
				aria-hidden="true"
			/>
			<input
				type="search"
				name="q"
				defaultValue={defaultValue}
				placeholder={placeholder}
				aria-label={placeholder}
				className={`${inputClass} pl-12`}
			/>
		</form>
	);
}
