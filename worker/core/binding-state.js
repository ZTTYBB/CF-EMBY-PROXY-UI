export function createBindingStateManager(createState) {
	let states = new WeakMap();
	let defaultState = createState();
	let currentState = defaultState;
	return {
		get(binding = null) {
			if (!binding || typeof binding !== "object" && typeof binding !== "function") return defaultState;
			let state = states.get(binding);
			if (!state) {
				state = createState();
				states.set(binding, state);
			}
			currentState = state;
			return state;
		},
		current() {
			return currentState;
		},
		reset() {
			states = new WeakMap();
			defaultState = createState();
			currentState = defaultState;
		}
	};
}
