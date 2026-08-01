import { createBindingStateManager } from "../../core/binding-state.js";

export function makeLogBindingStateManager() {
	return createBindingStateManager(() => ({
		LogQueue: [],
		LogDedupe: new Map(),
		LogFlushPending: false,
		LogFlushTask: null,
		LogClearEpochMs: 0,
		LogLastFlushAt: 0,
		runtimeConfig: null
	}));
}
