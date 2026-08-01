export function getDefaultCacheHandle(runtimeGlobals = globalThis) {
	try {
		return runtimeGlobals?.caches?.default ?? null;
	} catch {
		return null;
	}
}

export function getCryptoSubtle(runtimeGlobals = globalThis) {
	return runtimeGlobals.crypto.subtle;
}
