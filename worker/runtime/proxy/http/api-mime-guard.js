import { acceptsExplicitHtmlDocument, isHtmlHttpMediaType, normalizeHttpMediaType } from './media-types.js';
import { buildProxyErrorState } from './proxy-error-response.js';

export function guardApiResponseMime(execution, upstreamState, options = {}) {
	const response = upstreamState?.response;
	if (!response
		|| execution?.requestTraits?.isApiRequest !== true
		|| response.status === 101
		|| response.status === 204
		|| response.status === 205
		|| response.status === 304) return upstreamState;
	const sanitizePath = typeof options.sanitizePath === "function" ? options.sanitizePath : (value) => String(value || "/");
	const contentType = response.headers.get("Content-Type");
	const explicitDocumentRequest = (execution?.requestMethod === "GET" || execution?.requestMethod === "HEAD")
		&& sanitizePath(execution?.proxyPath || "/") === "/"
		&& acceptsExplicitHtmlDocument(execution?.request?.headers?.get("Accept"), contentType);
	if (explicitDocumentRequest) return upstreamState;
	if (!isHtmlHttpMediaType(contentType)) return upstreamState;
	const createErrorState = typeof options.buildErrorState === "function" ? options.buildErrorState : buildProxyErrorState;
	return createErrorState(execution, upstreamState, {
		message: "Upstream API returned an HTML document instead of API data.",
		guardHeader: "X-Proxy-Mime-Guard",
		guardValue: "html-document",
		details: {
			upstreamStatus: response.status,
			contentType: normalizeHttpMediaType(contentType) || "missing"
		}
	});
}
