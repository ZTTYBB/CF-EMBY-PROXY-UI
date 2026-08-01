import { createBindingStateManager } from './binding-state.js';

function createCleanupState() {
  return {
    phase: 0,
    lastRunAt: 0,
    iterators: {
      node: null,
      playbackRoute: null,
      crypto: null,
      rate: null,
      log: null,
      playbackInfo: null,
      failover: null,
      progress: null,
      monthlyTraffic: null
    }
  };
}

export function makeRuntimeConfigBindingStateManager() {
  const bindings = createBindingStateManager(() => ({ namespaces: new Map() }));
  let currentNamespace = 'default';

  const getEntryFromState = (state, namespace = 'default') => {
    const normalizedNamespace = String(namespace || 'default').trim() || 'default';
    let entry = state.namespaces.get(normalizedNamespace);
    if (!entry) {
      entry = {
        ConfigCache: null,
        RuntimeConfigCacheGeneration: 0,
        SingleFlightTasks: new Map()
      };
      state.namespaces.set(normalizedNamespace, entry);
    }
    currentNamespace = normalizedNamespace;
    return entry;
  };

  return {
    get(binding = null, namespace = 'default') {
      return getEntryFromState(bindings.get(binding), namespace);
    },
    current() {
      return getEntryFromState(bindings.current(), currentNamespace);
    },
    reset() {
      bindings.reset();
      currentNamespace = 'default';
    }
  };
}

export function makeKvMutationBindingStateManager() {
  const bindings = createBindingStateManager(() => ({
    KvDataMutationChain: Promise.resolve(),
    KvTidyMutationChain: Promise.resolve()
  }));
  return {
    get(binding = null) {
      return bindings.get(binding);
    },
    current() {
      return bindings.current();
    },
    reset() {
      bindings.reset();
    }
  };
}

export { createCleanupState };
