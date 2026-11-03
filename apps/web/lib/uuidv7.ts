/** RFC 9562 UUIDv7: 48-bit Unix milliseconds + random bits. Client event ids (ADR-0005). */
export function uuidv7(now: number = Date.now()): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	let ms = now;
	for (let i = 5; i >= 0; i--) {
		bytes[i] = ms % 256;
		ms = Math.floor(ms / 256);
	}
	bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
	bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
	const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
