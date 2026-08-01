export function normalizeHttpMediaType(value = "") {
	return String(value || "").trim().toLowerCase().split(";", 1)[0].trim();
}

export function isJsonHttpMediaType(value = "") {
	const mediaType = normalizeHttpMediaType(value);
	return mediaType === "application/json"
		|| mediaType === "text/json"
		|| /^application\/[a-z0-9!#$&^_.+-]+\+json$/i.test(mediaType);
}

export function isHtmlHttpMediaType(value = "") {
	const mediaType = normalizeHttpMediaType(value);
	return mediaType === "text/html" || mediaType === "application/xhtml+xml";
}

export function acceptsExplicitHtmlDocument(acceptHeader = "", representationType = "text/html") {
	const normalizedRepresentationType = normalizeHttpMediaType(representationType);
	if (!isHtmlHttpMediaType(normalizedRepresentationType)) return false;
	const [representationMajorType, representationMinorType] = normalizedRepresentationType.split("/", 2);
	let selectedSpecificity = -1;
	let selectedQuality = 0;
	for (const item of String(acceptHeader || "").split(",")) {
		const [rawMediaRange, ...rawParameters] = item.split(";");
		const mediaRange = normalizeHttpMediaType(rawMediaRange);
		const [majorType, minorType] = mediaRange.split("/", 2);
		let specificity = -1;
		if (majorType === representationMajorType && minorType === representationMinorType) specificity = 2;
		else if (majorType === representationMajorType && minorType === "*") specificity = 1;
		else if (majorType === "*" && minorType === "*") specificity = 0;
		if (specificity < selectedSpecificity || specificity < 0) continue;
		let quality = 1;
		for (const rawParameter of rawParameters) {
			const [rawName, rawValue] = rawParameter.split("=", 2);
			if (String(rawName || "").trim().toLowerCase() !== "q") continue;
			const qualityValue = String(rawValue || "").trim();
			quality = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(qualityValue) ? Number(qualityValue) : 0;
			break;
		}
		if (specificity > selectedSpecificity) {
			selectedSpecificity = specificity;
			selectedQuality = quality;
		}
	}
	return selectedQuality > 0;
}
