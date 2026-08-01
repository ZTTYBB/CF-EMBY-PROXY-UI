export function normalizeNodeNameList(input) {
	const rawList = Array.isArray(input) ? input : String(input || "").split(/[\\r\\n,，;；|]+/);
	const seen = new Set();
	const result = [];
	for (const item of rawList) {
		const value = String(item || "").trim();
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(value);
	}
	return result;
}

export function parseHostnameCandidate(rawHostname) {
	const host = String(rawHostname || "").trim().toLowerCase();
	if (!host) return null;
	const wildcard = host.includes("*");
	const cleaned = host.replace(/^\*\./, "").replace(/^\*+/, "").replace(/\*+$/g, "").replace(/^\.+|\.+$/g, "");
	if (!cleaned) return null;
	return { hostname: cleaned, wildcard };
}

export function normalizeHostnameText(rawHostname) {
	return parseHostnameCandidate(rawHostname)?.hostname || "";
}

export function normalizeDistinctConfigKeyList(values = []) {
	const list = Array.isArray(values) ? values : [values];
	const result = [];
	const seen = new Set();
	for (const value of list) {
		const key = String(value || "").trim();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(key);
	}
	return result;
}

export function isPlainObject(value) {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

export function clampIntegerConfig(value, fallback, min, max) {
	let num;
	if (typeof value === "number") num = value;
	else if (typeof value === "string") {
		const normalized = value.trim();
		if (!/^-?\d+$/.test(normalized)) return fallback;
		num = Number(normalized);
	} else return fallback;
	if (!Number.isFinite(num)) return fallback;
	return Math.min(max, Math.max(min, Math.floor(num)));
}

export function clampNumberConfig(value, fallback, min, max) {
	const num = Number(value);
	if (!Number.isFinite(num)) return fallback;
	return Math.min(max, Math.max(min, num));
}

export function hasOwnConfigKey(value, key) {
	return !!value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);
}

export function escapeSqlLike(value) {
	return String(value || "").replace(/[\\%_]/g, "\\$&");
}

export function isLikelyIpAddress(value) {
	const text = String(value || "").trim();
	if (!text) return false;
	if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text)) return true;
	return /^[0-9a-f:]+$/i.test(text) && text.includes(":");
}

export function isLikelyColoCode(value) {
	const text = String(value || "").trim();
	if (!text) return false;
	return /^[a-z]{3,4}$/i.test(text);
}
