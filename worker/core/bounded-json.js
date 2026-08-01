export function serializeBoundedJson(value, maxLength = 8192) {
	const limit = Math.max(2, Math.floor(Number(maxLength) || 8192));
	const maxEntries = Math.max(1, Math.min(32, Math.floor(limit / 256)));
	const maxStringLength = Math.max(16, Math.min(512, Math.floor(limit / Math.max(4, maxEntries * 2))));
	const maxDepth = 4;
	const maxNodes = Math.max(8, Math.min(256, Math.floor(limit / 32)));
	const seen = new WeakSet();
	let visitedNodes = 0;
	let didTruncate = false;
	const project = (input, depth = 0) => {
		if (input === null || input === undefined) return input;
		if (typeof input === "string") {
			if (input.length <= maxStringLength) return input;
			didTruncate = true;
			return `${input.slice(0, maxStringLength)}...`;
		}
		if (typeof input === "number" || typeof input === "boolean") return input;
		if (typeof input === "bigint") return String(input);
		if (typeof input !== "object") return String(input);
		if (seen.has(input)) return "[Circular]";
		if (depth >= maxDepth || visitedNodes >= maxNodes) {
			didTruncate = true;
			return "[Truncated]";
		}
		visitedNodes += 1;
		seen.add(input);
		try {
			if (Array.isArray(input)) {
				const result = [];
				for (let index = 0; index < input.length && index < maxEntries; index += 1) result.push(project(input[index], depth + 1));
				if (input.length > maxEntries) {
					didTruncate = true;
					result.push("[Truncated]");
				}
				return result;
			}
			const result = {};
			let entryCount = 0;
			for (const rawKey in input) {
				if (!Object.prototype.hasOwnProperty.call(input, rawKey)) continue;
				if (entryCount >= maxEntries) {
					didTruncate = true;
					result._truncated = true;
					break;
				}
				const key = rawKey.length > maxStringLength ? `${rawKey.slice(0, maxStringLength)}...` : rawKey;
				result[key] = project(input[rawKey], depth + 1);
				entryCount += 1;
			}
			return result;
		} finally {
			seen.delete(input);
		}
	};
	try {
		const serialized = JSON.stringify(project(value));
		if (!didTruncate && serialized && serialized.length <= limit) return serialized;
	} catch {}
	const truncated = JSON.stringify({ truncated: true });
	return truncated.length <= limit ? truncated : "{}";
}
