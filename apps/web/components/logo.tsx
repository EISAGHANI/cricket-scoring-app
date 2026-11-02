/** Stumps and bails with a ball, on a pitch-green tile. */
export function Logo({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 48 48" className={className} aria-hidden="true">
			<defs>
				<linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#15924f" />
					<stop offset="1" stopColor="#0a5732" />
				</linearGradient>
			</defs>
			<rect width="48" height="48" rx="14" fill="url(#logo-bg)" />
			<rect x="12" y="13" width="3.6" height="24" rx="1.8" fill="#f4fbf6" />
			<rect x="19.2" y="13" width="3.6" height="24" rx="1.8" fill="#f4fbf6" />
			<rect x="26.4" y="13" width="3.6" height="24" rx="1.8" fill="#f4fbf6" />
			<rect x="11" y="10" width="9" height="2.6" rx="1.3" fill="#f4fbf6" />
			<rect x="21" y="10" width="9" height="2.6" rx="1.3" fill="#f4fbf6" />
			<circle cx="35.5" cy="31" r="6.5" fill="#e23b3b" />
			<path
				d="M31.5 26.8c2.4 2 2.4 6.4 0 8.4M39.5 26.8c-2.4 2-2.4 6.4 0 8.4"
				stroke="#fff"
				strokeOpacity=".8"
				strokeWidth="1"
				fill="none"
			/>
		</svg>
	);
}
