export function buildProxyErrorState(execution, upstreamState, options = {}) {
	const response = upstreamState?.response;
	const status = Math.max(400, Number(options.status) || 502);
	const statusText = String(options.statusText || (status === 502 ? "Bad Gateway" : "Error")).trim();
	const responseHeaders = new Headers(response?.headers || {});
	[
		"Accept-Ranges",
		"Content-Disposition",
		"Content-Encoding",
		"Content-Length",
		"Content-MD5",
		"Content-Range",
		"Digest",
		"ETag",
		"Last-Modified",
		"Location",
		"Refresh",
		"Set-Cookie",
		"Transfer-Encoding"
	].forEach((header) => responseHeaders.delete(header));
	responseHeaders.set("Content-Type", "application/json; charset=utf-8");
	responseHeaders.set("Cache-Control", "no-store");
	responseHeaders.delete("X-Proxy-Mime-Guard");
	responseHeaders.delete("X-Proxy-Contract-Guard");
	const guardHeader = String(options.guardHeader || "").trim();
	const guardValue = String(options.guardValue || "").trim();
	if (guardHeader && guardValue) responseHeaders.set(guardHeader, guardValue);
	const responsePayload = {
		error: String(options.error || statusText || "Error"),
		code: status,
		message: String(options.message || "The API response did not satisfy the proxy contract."),
		...(options.details && typeof options.details === "object" && !Array.isArray(options.details) ? { details: options.details } : {})
	};
	try {
		Promise.resolve(response?.body?.cancel?.()).catch(() => {});
	} catch {}
	if (execution && typeof execution === "object") execution.proxyGuardState = guardValue;
	return {
		...upstreamState,
		response: new Response(execution?.requestMethod === "HEAD" ? null : JSON.stringify(responsePayload), {
			status,
			statusText,
			headers: responseHeaders
		})
	};
}
