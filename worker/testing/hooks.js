// Test-only ESM composition. Production modules must not import this file.
import {
  cacheState,
  createWorkerApplication,
  databaseReadinessState,
  fetchRequest,
  isolateState,
  logBindingStates,
  resetNodeBindingCacheStates,
  resetRuntimeBindingStates,
  runtimeState
} from '../runtime/application-facades.js';

function createMutableTestPartition(kernel) {
  const partition = {};
  for (const name of Reflect.ownKeys(kernel)) {
    Object.defineProperty(partition, name, {
      enumerable: true,
      configurable: false,
      get: () => kernel[name],
      set: value => {
        kernel[name] = value;
      }
    });
  }
  return partition;
}

export function createTestApplication() {
  const facades = createWorkerApplication({ includeTestingSupport: true });
  const {
    adminConsole,
    nodeProxy,
    scheduledMaintenance,
    workerHandler
  } = facades;
  const {
    cacheManager,
    kernel,
    logger,
    shellService
  } = facades.testingSupport;
  const proxyService = facades.testingSupport.proxyService;
  const routeTesting = Object.freeze({
    buildFetchRouteContext: facades.testingSupport.buildNodeRouteContext,
    buildRouteCorsResponse: facades.testingSupport.buildRouteCorsResponse,
    isPlaybackCriticalRouteContext: facades.testingSupport.isPlaybackCriticalRouteContext
  });
  const testPlatform = Object.freeze({
    kv: createMutableTestPartition(kernel),
    d1: createMutableTestPartition(kernel),
    cache: cacheManager,
    fetch: Object.freeze({
      adminActions: kernel.adminActionHandlers,
      adminShell: shellService,
      fetchRequest,
      logger,
      proxyService,
      routeTesting
    }),
    clock: Object.freeze({ now: () => Date.now() })
  });
  return Object.freeze({
    adminConsole,
    nodeProxy,
    scheduledMaintenance,
    workerHandler,
    testPlatform
  });
}

export function resetIsolateState() {
  resetNodeBindingCacheStates();
  resetRuntimeBindingStates();
  logBindingStates.reset();
  for (const partition of [cacheState, runtimeState, databaseReadinessState]) {
    for (const [key, value] of Object.entries(partition)) {
      if (value instanceof Map || value instanceof Set) value.clear();
      else if (value instanceof WeakMap) partition[key] = new WeakMap();
      else if (Array.isArray(value)) value.length = 0;
    }
  }
  cacheState.ConfigCache = null;
  cacheState.NodesListCache = null;
  cacheState.NodesRevisionCache = null;
  cacheState.NodesIndexCache = null;
  runtimeState.LogFlushPending = false;
  runtimeState.LogFlushTask = null;
  runtimeState.OpsStatusWriteChain = Promise.resolve();
  runtimeState.NodeIndexMutationChain = Promise.resolve();
  runtimeState.KvDataMutationChain = Promise.resolve();
  runtimeState.KvTidyMutationChain = Promise.resolve();
  return isolateState;
}
