import {
	createPlaybackInfoRepresentation,
	isPlaybackInfoRepresentation,
	parsePlaybackInfoRootObject
} from './contract.js';
import { isJsonHttpMediaType } from '../http/media-types.js';
import { sanitizePlaybackInfoSerializedResponseHeaders } from './rewrite.js';

function encodedBodyBytes(bodyText) {
	return new TextEncoder().encode(String(bodyText || "")).byteLength;
}

export function createPlaybackInfoCacheKey(parts, options = {}) {
	const hash = typeof options.hash === "function" ? options.hash : (value) => String(value || "");
	const serialize = typeof options.serialize === "function" ? options.serialize : JSON.stringify;
	return `playback-info:${hash(serialize(parts))}`;
}

export class PlaybackInfoCacheStore {
	constructor(options = {}) {
		if (!(options.entries instanceof Map)) throw new TypeError("PlaybackInfoCacheStore requires a Map");
		this.entries = options.entries;
		this.now = typeof options.now === "function" ? options.now : Date.now;
		this.maxEntries = Math.max(1, Number(options.maxEntries) || 1);
		this.maxEntryBytes = Math.max(1, Number(options.maxEntryBytes) || 1);
		this.maxTotalBytes = Math.max(1, Number(options.maxTotalBytes) || 1);
	}

	#validateEntry(entry) {
		const status = Number(entry?.status);
		if (!(status >= 200 && status < 300) || status === 204 || status === 205) return null;
		let headers;
		try {
			headers = new Headers(Array.isArray(entry.headers) ? entry.headers : []);
		} catch {
			return null;
		}
		if (!isJsonHttpMediaType(headers.get("Content-Type"))) return null;
		const bodyText = String(entry.bodyText || "");
		const bodyBytes = encodedBodyBytes(bodyText);
		if (bodyBytes > this.maxEntryBytes) return null;
		const payload = parsePlaybackInfoRootObject(bodyText);
		if (!payload) return null;
		return { headers, bodyText, bodyBytes, payload };
	}

	cleanup(now = this.now()) {
		for (const [cacheKey, entry] of this.entries) {
			const expiresAt = Number(entry?.expiresAt) || 0;
			if ((expiresAt > 0 && expiresAt <= now) || !this.#validateEntry(entry)) this.entries.delete(cacheKey);
		}
		while (this.entries.size > this.maxEntries) {
			const oldestKey = this.entries.keys().next().value;
			if (!oldestKey) break;
			this.entries.delete(oldestKey);
		}
		let totalBytes = 0;
		for (const entry of this.entries.values()) totalBytes += encodedBodyBytes(entry?.bodyText);
		while (this.entries.size > 0 && totalBytes > this.maxTotalBytes) {
			const oldestKey = this.entries.keys().next().value;
			if (!oldestKey) break;
			const oldestEntry = this.entries.get(oldestKey);
			totalBytes -= encodedBodyBytes(oldestEntry?.bodyText);
			this.entries.delete(oldestKey);
		}
	}

	set(cacheKey, representation, metadata = {}) {
		if (!cacheKey || !isPlaybackInfoRepresentation(representation)) return false;
		const response = representation.response;
		if (!(response.status >= 200 && response.status < 300)
			|| response.status === 204
			|| response.status === 205
			|| !isJsonHttpMediaType(response.headers.get("Content-Type"))) return false;
		const bodyBytes = encodedBodyBytes(representation.bodyText);
		if (bodyBytes > this.maxEntryBytes || !parsePlaybackInfoRootObject(representation.bodyText)) return false;
		const ttlMs = Math.max(0, Number(metadata.ttlMs) || 0);
		if (ttlMs <= 0) return false;
		const headers = sanitizePlaybackInfoSerializedResponseHeaders(response.headers);
		headers.delete("Set-Cookie");
		const now = this.now();
		this.entries.delete(cacheKey);
		this.entries.set(cacheKey, {
			nodeName: String(metadata.nodeName || "").trim().toLowerCase(),
			nodeRevision: String(metadata.nodeRevision || "").trim(),
			playbackInfoRewrite: String(metadata.playbackInfoRewrite || "").trim(),
			status: response.status,
			statusText: response.statusText,
			headers: [...headers.entries()],
			bodyText: representation.bodyText,
			bodyBytes,
			storedAt: now,
			expiresAt: now + ttlMs
		});
		this.cleanup(now);
		return true;
	}

	get(cacheKey) {
		if (!cacheKey) return null;
		this.cleanup();
		const entry = this.entries.get(cacheKey);
		if (!entry) return null;
		const validated = this.#validateEntry(entry);
		if (!validated) {
			this.entries.delete(cacheKey);
			return null;
		}
		let response;
		try {
			response = new Response(validated.bodyText, {
				status: Number(entry.status) || 200,
				statusText: String(entry.statusText || ""),
				headers: validated.headers
			});
		} catch {
			this.entries.delete(cacheKey);
			return null;
		}
		const representation = createPlaybackInfoRepresentation({
			response,
			bodyText: validated.bodyText,
			bodyBytes: validated.bodyBytes,
			payload: validated.payload
		});
		this.entries.delete(cacheKey);
		this.entries.set(cacheKey, { ...entry, bodyBytes: validated.bodyBytes });
		return { representation, metadata: entry };
	}
}
