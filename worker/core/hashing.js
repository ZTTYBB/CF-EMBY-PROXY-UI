export function hashStableText(input = "") {
	const text = String(input || "");
	let hash = 2166136261;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

export function hashStableStringParts(parts = []) {
	const normalizedParts = Array.isArray(parts) ? parts : [parts];
	let hash = 2166136261;
	const mixInteger = (value) => {
		for (let shift = 0; shift < 32; shift += 8) {
			hash ^= value >>> shift & 255;
			hash = Math.imul(hash, 16777619);
		}
	};
	mixInteger(normalizedParts.length);
	for (const part of normalizedParts) {
		const text = String(part ?? "");
		mixInteger(text.length);
		for (let index = 0; index < text.length; index += 1) {
			hash ^= text.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
	}
	return (hash >>> 0).toString(36);
}

export function hashPlaybackSessionFingerprint(input = "") {
	const bytes = new TextEncoder().encode(String(input || ""));
	let hash = 14695981039346656037n;
	const prime = 1099511628211n;
	for (const byte of bytes) {
		hash ^= BigInt(byte);
		hash = BigInt.asUintN(64, hash * prime);
	}
	return hash.toString(16).padStart(16, "0");
}

export async function sha256HexText(input = "") {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(input || "")));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
