import { readResponseTextWithLimit } from '../../../core/http-body.js';
import { isJsonHttpMediaType, normalizeHttpMediaType } from '../http/media-types.js';

export const PLAYBACK_INFO_CONTRACT = "playback-info";
const playbackInfoRepresentations = new WeakSet();

function isPlainObject(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

export function parsePlaybackInfoRootObject(bodyText = "") {
	let payload;
	try {
		payload = JSON.parse(String(bodyText || ""));
	} catch {
		return null;
	}
	return isPlainObject(payload) ? payload : null;
}

export function createPlaybackInfoRepresentation({ response, bodyText, bodyBytes, payload }) {
	if (!response || !isPlainObject(payload)) return null;
	const representation = Object.freeze({
		contract: PLAYBACK_INFO_CONTRACT,
		response,
		bodyText: String(bodyText || ""),
		bodyBytes: Math.max(0, Number(bodyBytes) || 0),
		payload
	});
	playbackInfoRepresentations.add(representation);
	return representation;
}

export function isPlaybackInfoRepresentation(value) {
	return playbackInfoRepresentations.has(value)
		&& value?.contract === PLAYBACK_INFO_CONTRACT
		&& !!value.response
		&& typeof value.bodyText === "string"
		&& Number.isFinite(value.bodyBytes)
		&& value.bodyBytes >= 0
		&& isPlainObject(value.payload);
}

function invalidResult(response, reason) {
	return Object.freeze({
		kind: "invalid",
		reason,
		details: Object.freeze({
			reason,
			upstreamStatus: Number(response?.status) || 0,
			contentType: normalizeHttpMediaType(response?.headers?.get?.("Content-Type")) || "missing"
		})
	});
}

export async function inspectPlaybackInfoResponse(response, options = {}) {
	const requestMethod = String(options.requestMethod || "GET").toUpperCase();
	if (!response
		|| !(response.status >= 200 && response.status < 300)
		|| requestMethod === "HEAD"
		|| response.status === 204
		|| response.status === 205
		|| !response.body) return Object.freeze({ kind: "skip" });
	if (!isJsonHttpMediaType(response.headers.get("Content-Type"))) return invalidResult(response, "unsupported_content_type");
	const bodyResult = await readResponseTextWithLimit(response.clone(), options.maxBytes);
	if (bodyResult.exceeded) return invalidResult(response, "body_too_large");
	const payload = parsePlaybackInfoRootObject(bodyResult.text);
	if (!payload) return invalidResult(response, "invalid_root_object");
	return Object.freeze({
		kind: "valid",
		representation: createPlaybackInfoRepresentation({
			response,
			bodyText: bodyResult.text,
			bodyBytes: bodyResult.bytes,
			payload
		})
	});
}
