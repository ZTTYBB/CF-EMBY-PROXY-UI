function normalizeActionName(value) {
	return String(value || "").trim();
}

export function defineActionRegistry(groups = [], options = {}) {
	const handlers = Object.create(null);
	const owners = new Map();
	for (const group of groups) {
		const groupName = normalizeActionName(group?.name) || "anonymous";
		const groupHandlers = group?.handlers && typeof group.handlers === "object" ? group.handlers : group;
		for (const [actionName, handler] of Object.entries(groupHandlers || {})) {
			if (typeof handler !== "function") throw new TypeError(`Admin action ${actionName} from ${groupName} is not a function`);
			if (handlers[actionName]) throw new Error(`Duplicate admin action ${actionName}: ${owners.get(actionName)} and ${groupName}`);
			handlers[actionName] = handler;
			owners.set(actionName, groupName);
		}
	}
	const aliases = Object.freeze({ ...options.aliases || {} });
	for (const [alias, target] of Object.entries(aliases)) {
		if (!handlers[target]) throw new Error(`Admin action alias ${alias} targets missing action ${target}`);
	}
	for (const requiredAction of options.requiredActions || []) {
		if (!handlers[requiredAction]) throw new Error(`Missing required admin action ${requiredAction}`);
	}
	const frozenHandlers = Object.freeze({ ...handlers });
	return Object.freeze({
		handlers: frozenHandlers,
		names: Object.freeze(Object.keys(frozenHandlers).sort()),
		resolve(actionName) {
			const normalized = normalizeActionName(actionName);
			return frozenHandlers[aliases[normalized] || normalized] || null;
		}
	});
}
