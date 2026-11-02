import Image from "next/image";

// Server component: ui.tsx is a client module, so class joining is local.
const cx = (...c: string[]): string => c.join(" ");

/** Uploaded photo/logo (already resized WebP) or initials. `shape` rounds avatars, squares logos. */
export function Avatar({
	src,
	name,
	size = 64,
	shape = "round",
}: {
	src: string | null;
	name: string;
	size?: number;
	shape?: "round" | "square";
}) {
	const radius = shape === "round" ? "rounded-full" : "rounded-2xl";
	if (src !== null) {
		return (
			<Image
				src={src}
				alt=""
				width={size}
				height={size}
				unoptimized
				className={cx(radius, "shrink-0 border border-line bg-surface-2 object-cover")}
			/>
		);
	}
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w.charAt(0).toUpperCase())
		.join("");
	return (
		<span
			aria-hidden="true"
			style={{ width: size, height: size, fontSize: size / 2.6 }}
			className={cx(
				radius,
				"grid shrink-0 place-items-center bg-brand-soft font-display font-bold text-brand",
			)}
		>
			{initials || "?"}
		</span>
	);
}
