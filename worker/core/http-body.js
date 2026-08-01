export function parseContentLengthHeader(value) {
	const raw = String(value || "").trim();
	if (!/^\d+$/.test(raw)) return null;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

export function decodeBufferedBodyText(buffer) {
	if (buffer === null || buffer === undefined) return "";
	try {
		if (buffer instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(buffer));
		if (ArrayBuffer.isView(buffer)) return new TextDecoder().decode(buffer);
		return String(buffer || "");
	} catch {
		return "";
	}
}

export async function readResponseBytesWithLimit(response, maxBytes) {
	const limit = Math.max(0, Math.floor(Number(maxBytes) || 0));
	const declaredBytes = parseContentLengthHeader(response?.headers?.get?.("Content-Length"));
	if (Number.isFinite(declaredBytes) && declaredBytes > limit) {
		try {
			Promise.resolve(response?.body?.cancel?.()).catch(() => {});
		} catch {}
		return {
			bodyBytes: new Uint8Array(0),
			bytes: declaredBytes,
			exceeded: true
		};
	}
	if (!response?.body) return {
		bodyBytes: new Uint8Array(0),
		bytes: 0,
		exceeded: false
	};
	const reader = response.body.getReader();
	const chunks = [];
	let totalBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
			if (totalBytes + chunk.byteLength > limit) {
				try {
					Promise.resolve(reader.cancel()).catch(() => {});
				} catch {}
				return {
					bodyBytes: new Uint8Array(0),
					bytes: totalBytes + chunk.byteLength,
					exceeded: true
				};
			}
			chunks.push(chunk);
			totalBytes += chunk.byteLength;
		}
	} catch {
		return {
			bodyBytes: new Uint8Array(0),
			bytes: totalBytes,
			exceeded: true
		};
	} finally {
		try {
			reader.releaseLock();
		} catch {}
	}
	const bodyBytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bodyBytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return {
		bodyBytes,
		bytes: totalBytes,
		exceeded: false
	};
}

export async function readResponseTextWithLimit(response, maxBytes) {
	const result = await readResponseBytesWithLimit(response, maxBytes);
	return {
		text: result.exceeded ? "" : new TextDecoder().decode(result.bodyBytes),
		bytes: result.bytes,
		exceeded: result.exceeded
	};
}
