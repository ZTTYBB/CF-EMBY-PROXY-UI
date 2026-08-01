import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTestApplication } from "../worker/testing/hooks.js";
import {
  AdminConsoleFacade,
  Config,
  NodeProxyFacade,
  ScheduledMaintenanceFacade,
  buildCanonicalWorkerMetadataCacheKey,
  buildDailyTelegramSummaryMessage,
  buildDnsIpWorkspaceSummary,
  buildProbeUpstreamUrl,
  buildProxyAccessRuleProfile,
  buildResolvedAdminIndexState,
  buildUpstreamProxyUrl,
  buildWorkerMetadataCacheIdentityPartition,
  buildWorkerMetadataCacheLookupRequest,
  buildWorkerMetadataCachePolicyRevision,
  buildWorkerMetadataPrewarmIdentityPartition,
  createTargetRecord,
  createWorkerApplication,
  defineAnalyticsCacheMethods,
  defineDatabaseStatusMethods,
  defineNodeRepositoryMethods,
  getDueScheduledClockSlots,
  logBindingStates,
  getNodeBindingCacheState,
  getRuntimeConfig,
  hasWorkerMetadataPrivateIdentity,
  hashStableStringParts,
  invalidateNodesRevisionCache,
  invalidateRuntimeConfigCache,
  isEmbyWebProxyPath,
  isolateState,
  resolveEffectiveRoutingDecisionMode,
  resolvePlaybackInfoRewriteUrlMode,
  resolveRoutingDecisionMode,
  runKvDataMutation,
  runSingleFlight,
  runWithConcurrency,
  resetRuntimeBindingStates,
  sanitizeRuntimeConfig,
  serializeBoundedLogDetailJson
} from "../worker/runtime/application-facades.js";

const hooks = createTestApplication();
assert.ok(hooks, "worker.js must expose Node test hooks");

const {
  adminConsole,
  nodeProxy,
  scheduledMaintenance,
  testPlatform,
  workerHandler
} = hooks;
const {
  adminActions,
  adminShell,
  logger,
  proxyService,
  routeTesting
} = testPlatform.fetch;
const {
  buildAdminLocalIndexUploadRecord,
  buildAdminRemoteShellErrorContent,
  buildAdminRemoteShellCacheKeyRequest,
  buildAdminRemoteShellLegacyCacheKeyRequest,
  buildAdminRemoteShellStoredResponse,
  buildAdminWarmSubrequest,
  collectAdminInlineDynamicImports,
  ensureAdminRemoteTailwindConfigGlobal,
  fetchAdminRemoteShellStoredResponse,
  getAdminRemoteShellAssetPolicyViolations,
  isAcceptedAdminHtmlDocumentContentType,
  hasAdminRemoteShellAppRoot,
  isAdminWarmResponseSuccessful,
  isAdminIndexSetupForced,
  isAdminWarmRoute,
  isMutableJsdelivrGithubAssetUrl,
  patchAdminShellRuntimeStatus,
  renderAdminLoginPage,
  renderAdminPage,
  renderAdminReleaseVendorAsset,
  renderAdminRemoteShellErrorPage,
  renderRemoteAdminPage,
  warmAdminReleaseVendorEntries
} = adminShell;
const kernel = testPlatform.kv;
const cachePort = testPlatform.cache;

assert.ok(routeTesting && typeof routeTesting === "object", "missing route test adapter");

test("stable string-part hashing avoids delimiter collisions without JSON serialization", () => {
  assert.equal(hashStableStringParts(["alpha", "beta"]), hashStableStringParts(["alpha", "beta"]));
  assert.notEqual(hashStableStringParts(["alpha", "beta"]), hashStableStringParts(["alpha:beta"]));
  assert.notEqual(hashStableStringParts(["a", "bc"]), hashStableStringParts(["ab", "c"]));
});

test("workflow facades replace capability ports and compatibility composition", () => {
  const facades = createWorkerApplication();
  assert.equal(Object.isFrozen(facades), true);
  assert.ok(facades.adminConsole instanceof AdminConsoleFacade);
  assert.ok(facades.nodeProxy instanceof NodeProxyFacade);
  assert.ok(facades.scheduledMaintenance instanceof ScheduledMaintenanceFacade);
  assert.equal("capabilityPorts" in facades, false);
  assert.equal("compatibilityOperations" in facades, false);
  assert.equal("testingSupport" in facades, false);
  assert.equal(typeof facades.adminConsole.handle, "function");
  assert.equal(typeof facades.nodeProxy.handle, "function");
  assert.equal(typeof facades.scheduledMaintenance.handle, "function");
  for (const facade of [facades.adminConsole, facades.nodeProxy, facades.scheduledMaintenance]) {
    assert.deepEqual(
      Object.getOwnPropertyNames(Object.getPrototypeOf(facade)).filter(name => name !== "constructor"),
      ["handle"]
    );
  }
});

test("test composition exposes the production facades and handler", () => {
  assert.deepEqual(Object.keys(hooks).sort(), [
    "adminConsole",
    "nodeProxy",
    "scheduledMaintenance",
    "testPlatform",
    "workerHandler"
  ]);
  assert.deepEqual(Object.keys(testPlatform).sort(), ["cache", "clock", "d1", "fetch", "kv"]);
  assert.ok(adminConsole instanceof AdminConsoleFacade);
  assert.ok(nodeProxy instanceof NodeProxyFacade);
  assert.ok(scheduledMaintenance instanceof ScheduledMaintenanceFacade);
  assert.notStrictEqual(testPlatform.kv, testPlatform.d1);
  assert.equal(typeof testPlatform.fetch.fetchRequest, "function");
  assert.equal(typeof testPlatform.clock.now, "function");
  assert.equal(typeof workerHandler.fetch, "function");
  assert.equal(typeof workerHandler.scheduled, "function");
  assert.equal(Object.isFrozen(workerHandler), true);
});

test("node proxy facade consumes a precomputed route context", async () => {
  const request = new Request("https://worker.test/");
  const env = {};
  const ctx = { waitUntil() {} };
  const routeContext = routeTesting.buildFetchRouteContext(request, env);

  const response = await nodeProxy.handle(request, env, ctx, routeContext);

  assert.equal(response.status, 404);
  assert.equal(routeContext.hostPrefixMatch, null);
  await assert.rejects(nodeProxy.handle(request, env, ctx, null), {
    name: "TypeError",
    message: "NodeProxyFacade.handle requires routeContext"
  });
});

test("production handler dispatches ordinary node routes without entering the admin facade", async () => {
  const application = createWorkerApplication();
  application.adminConsole.handle = async () => {
    throw new Error("ordinary node route entered AdminConsoleFacade");
  };

  const response = await application.workerHandler.fetch(
    new Request("https://worker.test/missing-node/System/Info"),
    {},
    { waitUntil() {} }
  );

  assert.equal(response.status, 404);
});

test("direct Admin facade and production handler reject unauthenticated read and write actions", async () => {
  const env = {
    ADMIN_PATH: "/admin",
    ADMIN_PASS: "admin-password",
    JWT_SECRET: "admin-secret"
  };
  const ctx = { waitUntil() {} };
  const buildRequest = action => new Request("https://worker.test/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data: action === "saveConfig" ? { rateLimitRpm: 30 } : {} })
  });

  for (const action of ["getConfig", "saveConfig"]) {
    const direct = await adminConsole.handle(buildRequest(action), env, ctx);
    const production = await workerHandler.fetch(buildRequest(action), env, ctx);
    assert.equal(direct.status, 401, `${action} direct facade status`);
    assert.equal(production.status, 401, `${action} production status`);
    assert.deepEqual(await direct.json(), await production.json());
  }
});

test("production scheduled handler owns waitUntil for empty and busy bindings", async () => {
  const emptyTasks = [];
  workerHandler.scheduled(
    { scheduledTime: Date.UTC(2026, 6, 30, 0, 0, 0) },
    {},
    { waitUntil(task) { emptyTasks.push(task); } }
  );
  assert.equal(emptyTasks.length, 1);
  await emptyTasks[0];

  const originals = {
    getDB: kernel.getDB,
    getKV: kernel.getKV,
    patchOpsStatus: kernel.patchOpsStatus,
    tryAcquireScheduledLeaseWithDb: kernel.tryAcquireScheduledLeaseWithDb
  };
  const statusPatches = [];
  try {
    kernel.getDB = () => ({});
    kernel.getKV = () => null;
    kernel.tryAcquireScheduledLeaseWithDb = async () => ({
      acquired: false,
      backend: "d1",
      reason: "lease_busy",
      lock: { expiresAt: "2026-07-30T00:05:00.000Z" }
    });
    kernel.patchOpsStatus = async (_env, patch) => {
      statusPatches.push(patch);
      return patch;
    };
    const busyTasks = [];
    workerHandler.scheduled(
      { scheduledTime: Date.UTC(2026, 6, 30, 0, 1, 0) },
      {},
      { waitUntil(task) { busyTasks.push(task); } }
    );
    assert.equal(busyTasks.length, 1);
    await busyTasks[0];
    assert.equal(statusPatches.length, 1);
    assert.equal(statusPatches[0].scheduled.lock.status, "busy");
    assert.equal(statusPatches[0].scheduled.lock.backend, "d1");
  } finally {
    for (const [name, value] of Object.entries(originals)) kernel[name] = value;
  }
});

test("formal Worker source tree omits legacy composition and public service forwarders", async () => {
  const [facadeSource, bundleSource] = await Promise.all([
    readFile(new URL("../worker/runtime/application-facades.js", import.meta.url), "utf8"),
    readFile(new URL("../worker.js", import.meta.url), "utf8")
  ]);
  assert.match(facadeSource, /class \{[\s\S]*AdminConsoleFacade|AdminConsoleFacade = class/);
  const retiredFeatureNeedles = [
    ["watch", "Repository"].join(""),
    ["definePlayback", "WatchLifecycleMethods"].join(""),
    ["expiry", "WarningDays"].join(""),
    ["initLogs", "Fts"].join(""),
    ["initD1", "Schema"].join(""),
    ["tmdb", "ApiKey"].join(""),
    ["serverRecord", "EmbyUsername"].join(""),
    ["mediaAggregation", "EmbyUsername"].join("")
  ];
  for (const source of [facadeSource, bundleSource]) {
    for (const needle of retiredFeatureNeedles) {
      assert.equal(source.includes(needle), false, needle);
    }
  }
  for (const relativePath of [
    "../worker/runtime/capabilities.js",
    "../worker/runtime/compat-facades.js",
    "../worker/features/admin/public/actions/service.js"
  ]) {
    await assert.rejects(readFile(new URL(relativePath, import.meta.url), "utf8"), { code: "ENOENT" });
  }
});

function createStatusTestService(db) {
  return defineDatabaseStatusMethods({
    bindingPort: {
      getDB: () => db,
      getKV: () => null
    },
    schemaReadinessPort: {
      isD1SchemaReadyCached: () => true,
      markD1SchemaReady() {}
    },
    statusPersistence: {
      buildOpsStatusRootPatch: patch => patch,
      cacheOpsStatusPayload() {},
      ensureSysStatusTable: async () => true,
      flushOpsStatusShadow: async () => ({}),
      getOpsStatusDbScope: sectionName => sectionName
        ? kernel.OPS_STATUS_SECTION_SCOPES[sectionName]
        : kernel.OPS_STATUS_DB_SCOPE_ROOT,
      getOpsStatusPayloadCache: () => null,
      getOpsStatusShadowPatch: activeDb => isolateState.OpsStatusShadowCache.get(activeDb)?.pendingPatch || {},
      getOpsStatusShadowState: () => null,
      resolveOpsStatusStores: value => ({ db: value, kv: null })
    }
  });
}

test("DNS IP workspace summary includes current-host and combined rows", () => {
  const summary = buildDnsIpWorkspaceSummary(
    [{ ipType: "IPv4", countryCode: "US", coloCode: "SJC" }],
    [{ ipType: "IPv6", countryCode: "DE", coloCode: "FRA" }]
  );

  assert.deepEqual(summary.currentHost, {
    ipCount: 1,
    ipv4Count: 1,
    ipv6Count: 0,
    countryCount: 1,
    coloCount: 1
  });
  assert.equal(summary.sharedPool.ipv6Count, 1);
  assert.deepEqual(summary.combined, {
    ipCount: 2,
    ipv4Count: 1,
    ipv6Count: 1,
    countryCount: 2,
    coloCount: 2
  });
});

test("PlaybackInfo URL mode is emitted only for rewrite mode", () => {
  assert.equal(resolvePlaybackInfoRewriteUrlMode("rewrite"), "relative");
  assert.equal(resolvePlaybackInfoRewriteUrlMode("passthrough"), "");
  assert.equal(resolvePlaybackInfoRewriteUrlMode("unknown"), "");
});

test("routing decision mode honors global config and node inheritance", () => {
  assert.equal(resolveRoutingDecisionMode({ routingDecisionMode: "legacy" }), "legacy");
  assert.equal(resolveRoutingDecisionMode({ routingDecisionMode: "simplified" }), "simplified");
  assert.equal(resolveEffectiveRoutingDecisionMode({ routingDecisionMode: "inherit" }, { routingDecisionMode: "legacy" }), "legacy");
  assert.equal(resolveEffectiveRoutingDecisionMode({ routingDecisionMode: "simplified" }, { routingDecisionMode: "legacy" }), "simplified");

  const requestTraits = {
    legacyEntryOffloadEnabled: true,
    legacyEntryOffloadReason: "legacy_direct",
    nodeDirectMedia: false,
    directStaticAssets: false,
    directHlsDash: false
  };
  assert.equal(proxyService.getEntryRoutingDecision({ routingDecisionMode: "legacy", requestTraits }).action, "DIRECT");
  assert.equal(proxyService.getEntryRoutingDecision({ routingDecisionMode: "simplified", requestTraits }).action, "PROXY");
});

test("runtime config sanitization migrates aliases once and drops retired fields", () => {
  const sanitized = sanitizeRuntimeConfig({
    directSourceNodes: ["Alpha"],
    enableH2: true,
    releaseRepo: "retired/repo",
    tgDailyReportTime: "08:30"
  });

  assert.deepEqual(sanitized.sourceDirectNodes, ["Alpha"]);
  assert.equal(sanitized.protocolStrategy, "balanced");
  assert.deepEqual(sanitized.tgDailyReportClockTimes, ["08:30"]);
  for (const key of ["directSourceNodes", "enableH2", "releaseRepo", "tgDailyReportTime"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(sanitized, key), false);
  }
});

test("runWithConcurrency preserves order and enforces normalized limits", async () => {
  const measure = async (limit) => {
    let active = 0;
    let peak = 0;
    const values = await runWithConcurrency([1, 2, 3, 4, 5], limit, async value => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active -= 1;
      return value * 2;
    });
    return { peak, values };
  };

  assert.deepEqual(await measure(2), { peak: 2, values: [2, 4, 6, 8, 10] });
  assert.deepEqual(await measure(Number.NaN), { peak: 1, values: [2, 4, 6, 8, 10] });
});

test("node probes preserve target base paths and require a successful response", async () => {
  const rootTarget = createTargetRecord("https://origin.example");
  const embyTarget = createTargetRecord("https://origin.example/emby");
  const mixedCaseTarget = createTargetRecord("https://origin.example/Emby");
  const nestedTarget = createTargetRecord("https://origin.example/proxy/emby");
  const mediaTarget = createTargetRecord("https://origin.example/media");
  assert.ok(rootTarget);
  assert.ok(embyTarget);
  assert.ok(mixedCaseTarget);
  assert.ok(nestedTarget);
  assert.ok(mediaTarget);
  assert.equal(
    buildProbeUpstreamUrl(rootTarget, "/emby/System/Info/Public").toString(),
    "https://origin.example/emby/System/Info/Public"
  );
  assert.equal(
    buildProbeUpstreamUrl(embyTarget, "/emby/System/Info/Public").toString(),
    "https://origin.example/emby/System/Info/Public"
  );
  assert.equal(
    buildProbeUpstreamUrl(embyTarget, "/System/Info/Public").toString(),
    "https://origin.example/emby/System/Info/Public"
  );
  assert.equal(
    buildProbeUpstreamUrl(mixedCaseTarget, "/emby/system/ping").toString(),
    "https://origin.example/Emby/system/ping"
  );
  assert.equal(
    buildProbeUpstreamUrl(embyTarget, "/EMBY/system/ping").toString(),
    "https://origin.example/emby/system/ping"
  );
  assert.equal(
    buildProbeUpstreamUrl(nestedTarget, "/emby/system/ping").toString(),
    "https://origin.example/proxy/emby/system/ping"
  );
  assert.equal(
    buildProbeUpstreamUrl(nestedTarget, "/proxy/emby/system/ping").toString(),
    "https://origin.example/proxy/emby/system/ping"
  );
  assert.equal(
    buildProbeUpstreamUrl(nestedTarget, "/PROXY/EMBY/system/ping").toString(),
    "https://origin.example/proxy/emby/system/ping"
  );
  assert.equal(
    buildProbeUpstreamUrl(mediaTarget, "/emby/system/ping").toString(),
    "https://origin.example/media/emby/system/ping"
  );
  assert.equal(
    buildUpstreamProxyUrl(embyTarget, "/System/Info/Public").toString(),
    "https://origin.example/emby/System/Info/Public"
  );
  assert.equal(
    buildUpstreamProxyUrl(nestedTarget, "/emby/system/ping").toString(),
    "https://origin.example/proxy/emby/emby/system/ping"
  );

  const responses = [404, 204, 405, 204, 501, 503, 503];
  const requests = [];
  await withWorkerGlobals({
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), method: String(init.method || "GET") });
      return new Response(null, { status: responses.shift() });
    }
  }, async () => {
    assert.equal(await kernel.pingTarget("https://origin.example/emby", 1000), 9999);
    const successLatency = await kernel.pingTarget("https://origin.example", 1000, {
      probePath: "/emby/System/Info/Public"
    });
    assert.ok(successLatency >= 0 && successLatency < 9999);
    const fallbackLatency = await kernel.pingTarget("https://origin.example/emby", 1000);
    assert.ok(fallbackLatency >= 0 && fallbackLatency < 9999);
    assert.equal(await kernel.pingTarget("https://origin.example/emby", 1000), 9999);
    assert.equal(await kernel.pingTarget("https://origin.example/emby", 1000), 9999);
  });
  assert.deepEqual(requests, [
    { url: "https://origin.example/emby/system/info/public", method: "HEAD" },
    { url: "https://origin.example/emby/System/Info/Public", method: "HEAD" },
    { url: "https://origin.example/emby/system/info/public", method: "HEAD" },
    { url: "https://origin.example/emby/system/info/public", method: "GET" },
    { url: "https://origin.example/emby/system/info/public", method: "HEAD" },
    { url: "https://origin.example/emby/system/info/public", method: "GET" },
    { url: "https://origin.example/emby/system/info/public", method: "HEAD" }
  ]);
});

test("failover probes reuse the base-aware probe URL and accept all 2xx responses", async () => {
  const originalProbeRequest = proxyService.performFailoverProbeRequest;
  const requests = [];
  proxyService.performFailoverProbeRequest = async (_execution, probeUrl, method) => {
    requests.push({ url: probeUrl.toString(), method });
    return new Response(null, { status: method === "HEAD" ? 405 : 204 });
  };
  try {
    const result = await proxyService.runFailoverProbeCandidate({
      failoverContext: { probePath: "/emby/system/ping", probeTimeoutMs: 1000 }
    }, createTargetRecord("https://origin.example/emby"));
    assert.equal(result.ok, true);
    assert.equal(result.status, 204);
    assert.equal(result.methodUsed, "GET");
    assert.deepEqual(requests, [
      { url: "https://origin.example/emby/system/ping", method: "HEAD" },
      { url: "https://origin.example/emby/system/ping", method: "GET" }
    ]);
  } finally {
    proxyService.performFailoverProbeRequest = originalProbeRequest;
  }
});

test("PlaybackInfo rewrite decodes object sources and removes invalid entries before client delivery", () => {
  const result = proxyService.rewritePlaybackInfoPayload(
    {
      proxyPath: "/Items/primary/PlaybackInfo",
      requestUrl: new URL("https://proxy.test/node/Items/primary/PlaybackInfo"),
      rawRequestUrl: new URL("https://proxy.test/node/Items/primary/PlaybackInfo"),
      nodeName: "node",
      nodeKey: "secret",
      entryMode: "kv_route"
    },
    {
      MediaSources: [
        JSON.stringify({ Id: "encoded-source" }),
        { Id: "valid-source", Path: "/Videos/primary/stream" },
        "invalid-source"
      ]
    },
    new URL("https://upstream.test"),
    new URL("https://upstream.test/Items/primary/PlaybackInfo")
  );

  assert.equal(result.rewriteState, "applied");
  assert.deepEqual(result.payload.MediaSources.map(source => source.Id), ["encoded-source", "valid-source"]);
  assert.ok(result.payload.MediaSources.every(source => source && typeof source === "object" && !Array.isArray(source)));
});

const requiredFunctionHooks = {
  runSingleFlight,
  isEmbyWebProxyPath,
  buildWorkerMetadataCacheIdentityPartition,
  buildWorkerMetadataPrewarmIdentityPartition,
  buildWorkerMetadataCachePolicyRevision,
  buildCanonicalWorkerMetadataCacheKey,
  buildWorkerMetadataCacheLookupRequest,
  hasWorkerMetadataPrivateIdentity,
  buildProxyAccessRuleProfile,
  serializeBoundedLogDetailJson,
  getRuntimeConfig,
  invalidateRuntimeConfigCache,
  invalidateNodesRevisionCache,
  buildResolvedAdminIndexState,
  buildAdminLocalIndexUploadRecord,
  buildAdminRemoteShellErrorContent,
  renderAdminRemoteShellErrorPage,
  isAdminIndexSetupForced,
  ensureAdminRemoteTailwindConfigGlobal,
  buildAdminRemoteShellCacheKeyRequest,
  buildAdminRemoteShellLegacyCacheKeyRequest,
  fetchAdminRemoteShellStoredResponse,
  buildAdminRemoteShellStoredResponse,
  patchAdminShellRuntimeStatus,
  renderRemoteAdminPage,
  renderAdminLoginPage,
  renderAdminPage,
  isAcceptedAdminHtmlDocumentContentType,
  isMutableJsdelivrGithubAssetUrl,
  renderAdminReleaseVendorAsset,
  isAdminWarmRoute,
  warmAdminReleaseVendorEntries,
  buildAdminWarmSubrequest,
  isAdminWarmResponseSuccessful,
  buildDailyTelegramSummaryMessage,
  getDueScheduledClockSlots
};

for (const [name, value] of Object.entries(requiredFunctionHooks)) {
  assert.equal(typeof value, "function", `missing Node test hook: ${name}`);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function withWorkerGlobals(overrides, callback) {
  const originalDescriptors = new Map();
  for (const [name, value] of Object.entries(overrides)) {
    originalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value
    });
  }
  try {
    return await callback();
  } finally {
    for (const [name, descriptor] of originalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

function countOccurrences(value, fragment) {
  return String(value).split(fragment).length - 1;
}

function createInMemoryKvStore(initialValues = {}) {
  const storedValues = new Map(
    Object.entries(initialValues).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value)
    ])
  );
  const putKeys = [];
  const deleteKeys = [];
  const kv = {
    async get(key, options = {}) {
      const stored = storedValues.get(key);
      if (stored === undefined) return null;
      return options.type === "json" ? JSON.parse(stored) : stored;
    },
    async put(key, value) {
      putKeys.push(key);
      storedValues.set(key, String(value));
    },
    async delete(key) {
      deleteKeys.push(key);
      storedValues.delete(key);
    },
    async list(options = {}) {
      const prefix = String(options.prefix || "");
      return {
        keys: [...storedValues.keys()]
          .filter(key => key.startsWith(prefix))
          .map(name => ({ name })),
        list_complete: true
      };
    }
  };
  return { kv, storedValues, putKeys, deleteKeys };
}

function createCloudflareDnsFetch(initialRecords = [], options = {}) {
  const records = new Map(initialRecords.map(record => [String(record.id), structuredClone(record)]));
  let nextId = initialRecords.length + 1;
  let mutationCount = 0;
  const jsonResponse = payload => new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" }
  });
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    if (method === "GET" && url.pathname.endsWith("/zones/zone-id")) {
      return jsonResponse({ success: true, result: { id: "zone-id", name: "proxy.example" } });
    }
    if (!url.pathname.includes("/zones/zone-id/dns_records")) {
      throw new Error(`unexpected Cloudflare request: ${method} ${url}`);
    }
    if (method === "GET") {
      const recordPathMatch = /\/dns_records\/([^/]+)$/.exec(url.pathname);
      if (recordPathMatch) {
        const recordId = decodeURIComponent(recordPathMatch[1]);
        return jsonResponse({ success: true, result: records.get(recordId) || null });
      }
      const name = String(url.searchParams.get("name") || "").toLowerCase();
      const result = [...records.values()].filter(record => !name || String(record.name || "").toLowerCase() === name);
      return jsonResponse({ success: true, result, result_info: { total_pages: 1 } });
    }
    mutationCount += 1;
    if (mutationCount === Number(options.failMutationAt)) {
      throw new Error(String(options.failureMessage || "dns_mutation_failed"));
    }
    const recordId = decodeURIComponent(url.pathname.split("/").at(-1) || "");
    if (method === "DELETE") {
      records.delete(recordId);
      return jsonResponse({ success: true, result: { id: recordId } });
    }
    const body = JSON.parse(String(init.body || "{}"));
    if (method === "PUT") {
      records.set(recordId, { id: recordId, ...body });
      return jsonResponse({ success: true, result: records.get(recordId) });
    }
    if (method === "POST") {
      const id = `created-${nextId++}`;
      records.set(id, { id, ...body });
      return jsonResponse({ success: true, result: records.get(id) });
    }
    throw new Error(`unexpected Cloudflare request: ${method} ${url}`);
  };
  return { fetch, records };
}

function getComparableDnsRecords(records) {
  return [...records.values()]
    .map(record => ({
      name: record.name,
      type: record.type,
      content: record.content,
      ttl: record.ttl,
      proxied: record.proxied === true
    }))
    .sort((left, right) => `${left.type}:${left.content}`.localeCompare(`${right.type}:${right.content}`));
}

test("daily Telegram summary places monthly traffic below today's traffic", async () => {
  const originalBuildDashboardStatsPayload = kernel.buildDashboardStatsPayload;
  const originalGetDashboardMonthlyTrafficPayload = kernel.getDashboardMonthlyTrafficPayload;
  const ctx = { waitUntil() {} };
  try {
    kernel.buildDashboardStatsPayload = async () => ({
      requestCountDisplay: "1,234",
      todayTraffic: "12.5 GB",
      playCount: 56,
      infoCount: 78,
      todayRequests: 1234
    });
    kernel.getDashboardMonthlyTrafficPayload = async (_env, options = {}) => {
      assert.equal(options.ctx, ctx);
      return { traffic: "345.6 GB" };
    };

    const payload = await kernel.buildDailyTelegramSummaryPayload({}, {
      config: { scheduleUtcOffsetMinutes: 480 },
      ctx,
      now: new Date("2026-07-19T04:00:00.000Z")
    });
    assert.equal(payload.monthlyTraffic, "345.6 GB");

    const message = buildDailyTelegramSummaryMessage(payload, { dateKey: "2026-07-19" });
    assert.equal(message, [
      "📊 EMBY-PROXY每日报表 (2026-07-19)",
      "",
      "请求数: 1,234",
      "视频流量 (CF 总计): 12.5 GB",
      "本月流量 (CF 总计): 345.6 GB",
      "请求: 播放请求 56 次 | 获取播放信息 78 次",
      "#Cloudflare #Emby #日报"
    ].join("\n"));
  } finally {
    kernel.buildDashboardStatsPayload = originalBuildDashboardStatsPayload;
    kernel.getDashboardMonthlyTrafficPayload = originalGetDashboardMonthlyTrafficPayload;
  }
});

test("oversized log detail fallback remains valid JSON", () => {
  const serialized = serializeBoundedLogDetailJson({ detail: "x".repeat(9000) });
  assert.ok(serialized.length <= 8192);
  assert.deepEqual(JSON.parse(serialized), { truncated: true });
});

test("log detail serialization distinguishes shared references from circular references", () => {
  const shared = { value: "shared" };
  const circular = { value: "circular" };
  circular.self = circular;

  assert.deepEqual(JSON.parse(serializeBoundedLogDetailJson({ first: shared, second: shared, circular })), {
    first: { value: "shared" },
    second: { value: "shared" },
    circular: { value: "circular", self: "[Circular]" }
  });
});

test("log detail serialization reads only its bounded field budget", () => {
  let reads = 0;
  const detail = {};
  for (let index = 0; index < 64; index += 1) Object.defineProperty(detail, `field_${index}`, {
    enumerable: true,
    get() {
      reads += 1;
      return "x".repeat(1024);
    }
  });

  const serialized = serializeBoundedLogDetailJson(detail);

  assert.doesNotThrow(() => JSON.parse(serialized));
  assert.ok(serialized.length <= 8192);
  assert.ok(reads <= 32);
});

test("monthly traffic stats are on-demand cached without touching D1", async () => {
  const zoneId = `monthly-zone-${Date.now()}`;
  const { kv } = createInMemoryKvStore({
    [kernel.CONFIG_KEY]: {
      cfZoneId: zoneId,
      cfApiToken: "monthly-token",
      scheduleUtcOffsetMinutes: 480
    }
  });
  const env = {
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: `monthly-traffic-${zoneId}`
  };
  const d1 = new globalThis.Proxy({}, {
    get() {
      throw new Error("monthly traffic must not access D1");
    }
  });
  const cacheEntries = new Map();
  const edgeCache = {
    async match(request) {
      return cacheEntries.get(request.url)?.clone() || null;
    },
    async put(request, response) {
      cacheEntries.set(request.url, response.clone());
    }
  };
  let graphqlRequestCount = 0;
  const fetch = async (input, init = {}) => {
    assert.equal(String(input), "https://api.cloudflare.com/client/v4/graphql");
    graphqlRequestCount += 1;
    const body = JSON.parse(String(init.body || "{}"));
    assert.match(body.query, /httpRequestsAdaptiveGroups/);
    assert.match(body.query, /edgeResponseBytes/);
    return new Response(JSON.stringify({
      data: {
        viewer: {
          zones: [{
            series: [
              { sum: { edgeResponseBytes: 1024 } },
              { sum: { edgeResponseBytes: 2048 } }
            ]
          }]
        }
      }
    }), { headers: { "Content-Type": "application/json" } });
  };
  const backgroundTasks = [];
  const ctx = { waitUntil(task) { backgroundTasks.push(Promise.resolve(task)); } };

  invalidateRuntimeConfigCache();
  isolateState.DashboardMonthlyTrafficCache.clear();
  await withWorkerGlobals({ fetch, caches: { default: edgeCache } }, async () => {
    const firstResponse = await adminActions.getMonthlyTrafficStats({}, {
      env,
      ctx,
      kv,
      db: d1
    });
    const firstPayload = await firstResponse.json();
    assert.equal(firstPayload.cfAnalyticsLoaded, true);
    assert.equal(firstPayload.period, "month");
    assert.ok(graphqlRequestCount >= 1);
    assert.equal(firstPayload.totalBytes, graphqlRequestCount * 3072);
    const liveRequestCount = graphqlRequestCount;
    await Promise.all(backgroundTasks.splice(0));

    const memoryResponse = await adminActions.getMonthlyTrafficStats({}, {
      env,
      ctx,
      kv,
      db: d1
    });
    assert.equal((await memoryResponse.json()).cacheStatus, "cache");
    assert.equal(graphqlRequestCount, liveRequestCount);

    isolateState.DashboardMonthlyTrafficCache.clear();
    const edgeResponse = await adminActions.getMonthlyTrafficStats({}, {
      env,
      ctx,
      kv,
      db: d1
    });
    assert.equal((await edgeResponse.json()).cacheStatus, "cache");
    assert.equal(graphqlRequestCount, liveRequestCount);
  });
});

test("monthly traffic splits GraphQL windows to one day while preserving edge response bytes", async () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const monthWindow = {
    monthKey: "2026-07",
    periodLabel: "2026年7月",
    startTs: Date.parse("2026-07-01T00:00:00.000Z"),
    endTs: Date.parse("2026-07-03T12:00:00.000Z")
  };
  const ranges = [];
  const fetch = async (input, init = {}) => {
    assert.equal(String(input), "https://api.cloudflare.com/client/v4/graphql");
    const query = String(JSON.parse(String(init.body || "{}")).query || "");
    const startMatch = /datetime_geq:\s*"([^"]+)"/.exec(query);
    const endMatch = /datetime_leq:\s*"([^"]+)"/.exec(query);
    assert.ok(startMatch);
    assert.ok(endMatch);
    const startTs = Date.parse(startMatch[1]);
    const endTs = Date.parse(endMatch[1]);
    assert.ok(endTs - startTs < dayMs);
    ranges.push({ startTs, endTs });
    return new Response(JSON.stringify({
      data: {
        viewer: {
          zones: [{ series: [{ sum: { edgeResponseBytes: 1024 } }] }]
        }
      }
    }), { headers: { "Content-Type": "application/json" } });
  };

  await withWorkerGlobals({ fetch }, async () => {
    const payload = await kernel.buildDashboardMonthlyTrafficPayload({}, {
      config: {
        cfZoneId: "monthly-zone",
        cfApiToken: "monthly-token",
        scheduleUtcOffsetMinutes: 0
      },
      monthWindow,
      nowMs: monthWindow.endTs
    });
    assert.equal(payload.totalBytes, 3 * 1024);
    assert.equal(payload.traffic, "3 KB");
  });
  assert.equal(ranges.length, 3);
  assert.deepEqual(ranges.map(range => range.startTs), [
    monthWindow.startTs,
    monthWindow.startTs + dayMs,
    monthWindow.startTs + 2 * dayMs
  ]);
});

test("remote shell error responses are no-store and never expose saved secrets", async () => {
  let cacheReadCount = 0;
  let cacheWriteCount = 0;
  const edgeCache = {
    async match() {
      cacheReadCount += 1;
      return null;
    },
    async put() {
      cacheWriteCount += 1;
    }
  };
  const env = { ADMIN_PATH: "/admin" };
  const initHealth = { ok: true, missing: [] };
  const config = {
    cfApiToken: "cf-api-token-must-not-leak",
    tgBotToken: "telegram-token-must-not-leak",
    tgChatId: "chat-id-must-not-leak",
    indexUrl: "https://example.test/releases/v1/index.html"
  };
  const statusOptions = {
    reason: "remote_shell_render_failed: upstream unavailable",
    remoteShellIndexUrl: config.indexUrl
  };

  await withWorkerGlobals({ caches: { default: edgeCache } }, async () => {
    const response = await renderAdminRemoteShellErrorPage(
      new Request("https://worker.test/admin"),
      env,
      null,
      initHealth,
      statusOptions,
      config
    );
    const html = await response.text();

    assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
    assert.match(html, /href="\/admin\?setup=1"/);
    assert.doesNotMatch(html, /saveConfig|currentConfig|cfApiToken|tgBotToken/);
    assert.doesNotMatch(html, /cf-api-token-must-not-leak|telegram-token-must-not-leak|chat-id-must-not-leak/);

    const headResponse = await renderAdminRemoteShellErrorPage(
      new Request("https://worker.test/admin", { method: "HEAD" }),
      env,
      null,
      initHealth,
      statusOptions,
      config
    );
    assert.equal(headResponse.headers.get("Cache-Control"), "no-store, max-age=0");
    assert.equal(await headResponse.text(), "");
  });

  assert.equal(cacheReadCount, 0);
  assert.equal(cacheWriteCount, 0);
});

test("stable admin shell cache-hit status writes are throttled per D1 binding", async () => {
  const db = { prepare() { throw new Error("unexpected D1 query"); } };
  const env = { DB: db, ADMIN_PATH: "/admin" };
  const originalPatchOpsStatus = kernel.patchOpsStatus;
  const writes = [];
  kernel.patchOpsStatus = async (_envOrStore, patch) => {
    writes.push(patch);
    return patch;
  };
  const baseStatus = {
    shellState: {
      remoteShellConfigured: true,
      embeddedFallbackAvailable: true,
      finalUiHtmlRetired: true,
      remoteShellIndexUrl: "https://example.test/releases/v1/index.html"
    },
    initHealth: { ok: true, missing: [] },
    mode: "remote",
    sourceType: "remote_cache",
    routeState: "remote_active",
    remoteCacheState: "hit",
    lastFetchStatus: "cached",
    reason: "served_cached_remote_shell",
    requestPath: "/admin",
    throttleStableWrites: true
  };

  try {
    await patchAdminShellRuntimeStatus(env, baseStatus);
    await patchAdminShellRuntimeStatus(env, baseStatus);
    assert.equal(writes.length, 1);
    assert.deepEqual(
      Object.keys(isolateState.AdminShellStatusWriteState.get(db) || {}).sort(),
      ["fingerprint", "writePromise", "writtenAt"]
    );

    await patchAdminShellRuntimeStatus(env, {
      ...baseStatus,
      remoteCacheState: "stale_hit",
      revalidateDue: true,
      reason: "served_cached_remote_shell_and_scheduled_revalidate"
    });
    assert.equal(writes.length, 2);

    await patchAdminShellRuntimeStatus(env, {
      ...baseStatus,
      throttleStableWrites: false
    });
    assert.equal(writes.length, 3);
  } finally {
    kernel.patchOpsStatus = originalPatchOpsStatus;
  }
});

test("error content contains only the manual setup link", () => {
  const html = buildAdminRemoteShellErrorContent(
    { adminPath: "/console", loginPath: "/console/login" },
    { remoteShellIndexUrl: "https://example.test/index.html" },
    {},
    { reason: "upstream unavailable" }
  );

  assert.match(html, /href="\/console\?setup=1"/);
  assert.doesNotMatch(html, /<script|saveConfig|currentConfig/);
});

test("setup query accepts only 1 and true", () => {
  assert.equal(isAdminIndexSetupForced(new Request("https://worker.test/admin?setup=1")), true);
  assert.equal(isAdminIndexSetupForced(new Request("https://worker.test/admin?setup=true")), true);
  assert.equal(isAdminIndexSetupForced(new Request("https://worker.test/admin?setup=TRUE")), true);
  assert.equal(isAdminIndexSetupForced(new Request("https://worker.test/admin?setup=0")), false);
  assert.equal(isAdminIndexSetupForced(new Request("https://worker.test/admin?setup=false")), false);
  assert.equal(isAdminIndexSetupForced(new Request("https://worker.test/admin")), false);
});

test("admin login page emits valid submit interception script", async () => {
  const response = await renderAdminLoginPage(
    new Request("https://worker.test/console/login"),
    {
      ADMIN_PATH: "/console/",
      ADMIN_PASS: "test-password",
      JWT_SECRET: "test-secret"
    },
    { ok: true, missing: [] }
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
  const html = await response.text();
  const loginScript = html.match(/<script>\s*(const ADMIN_LOGIN_RUNTIME[\s\S]*?)<\/script>/)?.[1] || "";
  assert.ok(loginScript, "login submit script must be present");
  assert.match(loginScript, /\.replace\(\/\\\/\+\$\/, ""\)/);
  assert.match(loginScript, /payload\?\.remain/);
  assert.match(loginScript, /还可尝试/);
  assert.match(loginScript, /\bfetch\(/);
  assert.doesNotMatch(loginScript, /\bfetchRequest\(/);
  assert.doesNotThrow(() => new Function(loginScript));
});

test("admin login preserves leading and trailing password whitespace", async () => {
  const response = await workerHandler.fetch(
    new Request("https://worker.test/console/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "  exact password  " })
    }),
    {
      ADMIN_PATH: "/console",
      ADMIN_PASS: "  exact password  ",
      JWT_SECRET: "test-secret"
    },
    { waitUntil() {} }
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.match(response.headers.get("Set-Cookie") || "", /auth_token=/);
});

test("admin warm route is exact and follows the configured admin path", () => {
  assert.equal(isAdminWarmRoute("/admin/__warm", "/admin"), true);
  assert.equal(isAdminWarmRoute("/console/__warm/", "/console"), true);
  assert.equal(isAdminWarmRoute("/admin", "/admin"), false);
  assert.equal(isAdminWarmRoute("/admin/__warm/asset", "/admin"), false);
});

test("manual setup renders GET and HEAD as no-store with the recovery reason", async () => {
  const statusPatches = [];
  const originalPatchOpsStatus = kernel.patchOpsStatus;
  kernel.patchOpsStatus = async (_env, patch) => {
    statusPatches.push(patch);
    return patch;
  };

  try {
    const getResponse = await renderAdminPage(
      new Request("https://worker.test/console?setup=1"),
      { ADMIN_PATH: "/console" },
      null,
      { ok: true, missing: [] },
      { indexUrl: "https://example.test/releases/v1/index.html" }
    );
    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.headers.get("Cache-Control"), "no-store, max-age=0");
    const setupHtml = await getResponse.text();
    assert.match(setupHtml, /class="admin-gate-shell"/);
    assert.match(setupHtml, /id="admin-gate-local-file"/);
    assert.match(setupHtml, /action: "uploadAdminIndex"/);
    assert.doesNotMatch(setupHtml, /GitHub Release|getGithubReleaseSourceOptions|saveConfig|currentConfig|INDEX_URL/);
    const gateScript = setupHtml.match(/<script>\s*(const ADMIN_INDEX_GATE_RUNTIME[\s\S]*?)<\/script>/)?.[1] || "";
    assert.ok(gateScript, "setup gate script must be present");
    assert.match(gateScript, /\bfetch\(/);
    assert.doesNotMatch(gateScript, /\bfetchRequest\(/);
    assert.doesNotThrow(() => new Function(gateScript));

    const headResponse = await renderAdminPage(
      new Request("https://worker.test/console?setup=true", { method: "HEAD" }),
      { ADMIN_PATH: "/console" },
      null,
      { ok: true, missing: [] },
      { indexUrl: "https://example.test/releases/v1/index.html" }
    );
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("Cache-Control"), "no-store, max-age=0");
    assert.equal(await headResponse.text(), "");
  } finally {
    kernel.patchOpsStatus = originalPatchOpsStatus;
  }

  assert.deepEqual(
    statusPatches.map(patch => patch.adminShell.reason),
    ["manual_setup_requested", "manual_setup_requested"]
  );
});

test("bundled frontend assets render when no uploaded admin index is configured", async () => {
  const assetRequests = [];
  const bundledHtml = '<!doctype html><html><head><title>Bundled UI</title></head><body><div id="app" data-source="bundled"></div></body></html>';
  const env = {
    ADMIN_PATH: "/console",
    ASSETS: {
      async fetch(request) {
        assetRequests.push(request);
        return new Response(bundledHtml, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "ETag": '"bundled-v1"'
          }
        });
      }
    }
  };

  const getResponse = await renderAdminPage(
    new Request("https://worker.test/console"),
    env,
    null,
    { ok: true, missing: [] },
    {}
  );
  const renderedHtml = await getResponse.text();
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.match(renderedHtml, /data-source="bundled"/);
  assert.match(renderedHtml, /"adminPath":"\/console"/);
  assert.match(renderedHtml, /"mode":"embedded"/);
  assert.match(renderedHtml, /"bundledShellAvailable":true/);
  assert.equal(new URL(assetRequests[0].url).pathname, "/index.html");
  assert.equal(assetRequests[0].method, "GET");

  const headResponse = await renderAdminPage(
    new Request("https://worker.test/console", { method: "HEAD" }),
    env,
    null,
    { ok: true, missing: [] },
    {}
  );
  assert.equal(headResponse.status, 200);
  assert.equal(await headResponse.text(), "");
});

test("Tailwind compatibility prelude is targeted and idempotent", () => {
  const legacyShell = "<!doctype html><html><head><script src=\"https://cdn.tailwindcss.com\"></script><script nonce=\"abc\">tailwind.config={darkMode:'class'}</script></head><body><div id=\"app\"></div></body></html>";
  const migratedShell = ensureAdminRemoteTailwindConfigGlobal(legacyShell);
  const prelude = '<script id="admin-tailwind-prelude">window.tailwind=window.tailwind||{};</script>';

  assert.equal(countOccurrences(migratedShell, prelude), 1);
  assert.ok(migratedShell.indexOf(prelude) < migratedShell.indexOf("tailwind.config"));

  const currentShell = `<!doctype html><html><head>${prelude}<script>tailwind.config={}</script></head><body><div id="app"></div></body></html>`;
  assert.equal(ensureAdminRemoteTailwindConfigGlobal(currentShell), currentShell);

  const shellWithoutTailwindConfig = "<!doctype html><html><head><script src=\"/app.js\"></script></head><body><div id=\"app\"></div></body></html>";
  assert.equal(ensureAdminRemoteTailwindConfigGlobal(shellWithoutTailwindConfig), shellWithoutTailwindConfig);
  assert.equal(ensureAdminRemoteTailwindConfigGlobal(migratedShell), migratedShell);
});

test("Tailwind compatibility distinguishes real attributes from data attributes", () => {
  const prelude = '<script id="admin-tailwind-prelude">window.tailwind=window.tailwind||{};</script>';
  const dataAttributeShell = '<!doctype html><html><head><script data-id="admin-tailwind-prelude"></script><script data-src="legacy.js">tailwind.config={}</script></head><body><div id="app"></div></body></html>';
  const migratedShell = ensureAdminRemoteTailwindConfigGlobal(dataAttributeShell);

  assert.equal(countOccurrences(migratedShell, prelude), 1);
  assert.ok(migratedShell.indexOf(prelude) < migratedShell.indexOf("tailwind.config"));

  const existingSingleQuotedPrelude = "<script id = 'admin-tailwind-prelude'>window.tailwind={};</script><script>tailwind.config={}</script>";
  assert.equal(ensureAdminRemoteTailwindConfigGlobal(existingSingleQuotedPrelude), existingSingleQuotedPrelude);

  const quotedAttributeShell = '<script title=" id=\'admin-tailwind-prelude\' "></script><script title=" src=legacy.js ">tailwind.config={}</script>';
  assert.equal(countOccurrences(ensureAdminRemoteTailwindConfigGlobal(quotedAttributeShell), prelude), 1);
});

test("remote shell cache identity separates legacy, transform, and full bootstrap variants", () => {
  const request = new Request("https://worker.test/admin?ignored=1");
  const sourceUrl = "https://example.test/releases/v1/index.html";
  const bootstrapA = {
    adminPath: "/admin",
    contract: { primaryViews: ["dashboard", "settings"] },
    initHealth: { ok: true, detail: { revision: "a" } }
  };
  const bootstrapB = {
    ...bootstrapA,
    initHealth: { ok: true, detail: { revision: "b" } }
  };

  const legacyUrl = new URL(buildAdminRemoteShellLegacyCacheKeyRequest(request, sourceUrl).url);
  const currentAUrl = new URL(buildAdminRemoteShellCacheKeyRequest(request, sourceUrl, bootstrapA).url);
  const currentBUrl = new URL(buildAdminRemoteShellCacheKeyRequest(request, sourceUrl, bootstrapB).url);

  assert.equal(legacyUrl.searchParams.has("transform"), false);
  assert.equal(legacyUrl.searchParams.has("bootstrap"), false);
  assert.ok(currentAUrl.searchParams.get("transform"));
  assert.ok(currentAUrl.searchParams.get("bootstrap"));
  assert.notEqual(currentAUrl.href, legacyUrl.href);
  assert.notEqual(currentAUrl.href, currentBUrl.href);
  assert.equal(currentAUrl.pathname, "/admin");
});

test("legacy stale cache migrates to the current key before one failing SWR task", async () => {
  isolateState.SingleFlightTasks.clear();
  isolateState.AdminRemoteShellCacheMutationChains.clear();
  const remoteShellIndexUrl = "https://example.test/releases/v1/index.html";
  const legacyHtml = '<!doctype html><html><head><script id="admin-bootstrap" type="application/json">{"old":true}</script><script>tailwind.config={}</script></head><body><div id="app"></div></body></html>';
  const legacyResponse = buildAdminRemoteShellStoredResponse(legacyHtml, {
    variantEtag: "legacy-browser-etag",
    lastModified: "Wed, 01 Jul 2026 12:00:00 GMT",
    originEtag: "legacy-upstream-etag",
    originLastModified: "Tue, 30 Jun 2026 12:00:00 GMT",
    sourceUrl: remoteShellIndexUrl,
    cachedAt: 1
  });
  const events = [];
  const storedWrites = [];
  const storedResponses = new Map();
  const backgroundTasks = [];
  const reportedWarnings = [];
  const edgeCache = {
    async match(request) {
      const url = new URL(request.url);
      events.push(`match:${url.searchParams.has("transform") ? "current" : "legacy"}`);
      return url.searchParams.has("transform") ? null : legacyResponse.clone();
    },
    async put(request, response) {
      const url = new URL(request.url);
      events.push(`put:${url.searchParams.has("transform") ? "current" : "legacy"}`);
      storedResponses.set(url.href, response.clone());
      storedWrites.push({
        url,
        cachedAt: response.headers.get("X-Admin-Shell-Cached-At"),
        html: await response.clone().text()
      });
    }
  };
  const ctx = {
    waitUntil(task) {
      backgroundTasks.push(Promise.resolve(task));
    }
  };
  const quietConsole = Object.assign(Object.create(console), {
    warn(...args) {
      reportedWarnings.push(args);
    }
  });

  await withWorkerGlobals({
    caches: { default: edgeCache },
    console: quietConsole,
    fetch: async () => {
      events.push("revalidate");
      throw new Error("revalidation unavailable");
    }
  }, async () => {
    const response = await renderRemoteAdminPage(
      new Request("https://worker.test/admin"),
      { ADMIN_PATH: "/admin" },
      ctx,
      { ok: true, missing: [] },
      remoteShellIndexUrl,
      { indexUrl: remoteShellIndexUrl, releaseTag: "v1.0.0" }
    );
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /id="admin-tailwind-prelude"/);
    assert.doesNotMatch(html, /\{"old":true\}/);
    assert.equal(storedWrites.length, 1);
    assert.equal(backgroundTasks.length, 1);
    await Promise.all(backgroundTasks);
  });

  assert.deepEqual(events, ["match:current", "match:legacy", "match:current", "put:current", "revalidate"]);
  assert.equal(storedWrites.length, 1);
  assert.ok(storedWrites[0].url.searchParams.get("transform"));
  assert.ok(storedWrites[0].url.searchParams.get("bootstrap"));
  assert.equal(storedWrites[0].cachedAt, "1");
  assert.match(storedWrites[0].html, /id="admin-tailwind-prelude"/);
  assert.equal(storedResponses.has(storedWrites[0].url.href), true);
  assert.equal(reportedWarnings.length, 1);
  assert.equal(isolateState.SingleFlightTasks.size, 0);
  assert.equal(isolateState.AdminRemoteShellCacheMutationChains.size, 0);
});

test("concurrent legacy migration cannot overwrite a fresh revalidation in one isolate", async () => {
  isolateState.SingleFlightTasks.clear();
  isolateState.AdminRemoteShellCacheMutationChains.clear();
  const remoteShellIndexUrl = "https://example.test/releases/v1/index.html";
  const legacyHtml = '<!doctype html><html><head><script>tailwind.config={}</script></head><body><div id="app">legacy-marker</div></body></html>';
  const legacyResponse = buildAdminRemoteShellStoredResponse(legacyHtml, {
    variantEtag: "legacy-etag",
    lastModified: "Wed, 01 Jul 2026 12:00:00 GMT",
    originEtag: "legacy-upstream-etag",
    originLastModified: "Tue, 30 Jun 2026 12:00:00 GMT",
    sourceUrl: remoteShellIndexUrl,
    cachedAt: 1
  });
  const freshCommitted = createDeferred();
  const backgroundTasks = [];
  let currentMatchCount = 0;
  let legacyMatchCount = 0;
  let staleWriteCount = 0;
  let freshWriteCount = 0;
  let revalidationFetchCount = 0;
  let currentStoredResponse = null;
  const edgeCache = {
    async match(request) {
      const currentKey = new URL(request.url).searchParams.has("transform");
      if (currentKey) {
        currentMatchCount += 1;
        return null;
      }
      legacyMatchCount += 1;
      return legacyResponse.clone();
    },
    async put(_request, response) {
      const html = await response.clone().text();
      if (html.includes("legacy-marker")) {
        staleWriteCount += 1;
        if (staleWriteCount > 1) await freshCommitted.promise;
      } else if (html.includes("fresh-marker")) {
        freshWriteCount += 1;
      } else {
        throw new Error("unexpected remote shell cache write");
      }
      currentStoredResponse = response.clone();
      if (html.includes("fresh-marker")) freshCommitted.resolve();
    }
  };
  const ctx = {
    waitUntil(task) {
      backgroundTasks.push(Promise.resolve(task));
    }
  };

  await withWorkerGlobals({
    caches: { default: edgeCache },
    fetch: async () => {
      revalidationFetchCount += 1;
      if (revalidationFetchCount > 1) throw new Error("duplicate revalidation");
      return new Response('<!doctype html><html><body><div id="app">fresh-marker</div></body></html>', {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ETag: '"fresh-upstream-etag"',
          "Last-Modified": "Thu, 02 Jul 2026 12:00:00 GMT"
        }
      });
    }
  }, async () => {
    const render = () => renderRemoteAdminPage(
      new Request("https://worker.test/admin"),
      { ADMIN_PATH: "/admin" },
      ctx,
      { ok: true, missing: [] },
      remoteShellIndexUrl,
      { indexUrl: remoteShellIndexUrl, releaseTag: "v1.0.0" }
    );
    const responses = await Promise.all([render(), render()]);
    const responseBodies = await Promise.all(responses.map(response => response.text()));
    assert.equal(responseBodies.length, 2);
    for (const responseBody of responseBodies) assert.match(responseBody, /legacy-marker/);
    await Promise.all(backgroundTasks);
  });

  assert.equal(currentMatchCount, 2);
  assert.equal(legacyMatchCount, 1);
  assert.equal(staleWriteCount, 1);
  assert.equal(freshWriteCount, 1);
  assert.equal(revalidationFetchCount, 1);
  assert.match(await currentStoredResponse.text(), /fresh-marker/);
  assert.equal(isolateState.SingleFlightTasks.size, 0);
  assert.equal(isolateState.AdminRemoteShellCacheMutationChains.size, 0);
});

test("legacy migration waits for an in-flight fresh write after current-cache eviction", async () => {
  isolateState.SingleFlightTasks.clear();
  isolateState.AdminRemoteShellCacheMutationChains.clear();
  const remoteShellIndexUrl = "https://example.test/releases/v1/index.html";
  const staleResponse = buildAdminRemoteShellStoredResponse(
    '<!doctype html><html><body><div id="app">stale-marker</div></body></html>',
    {
      variantEtag: "stale-etag",
      sourceUrl: remoteShellIndexUrl,
      cachedAt: 1
    }
  );
  const legacyResponse = buildAdminRemoteShellStoredResponse(
    '<!doctype html><html><body><div id="app">legacy-marker</div></body></html>',
    {
      variantEtag: "legacy-etag",
      sourceUrl: remoteShellIndexUrl,
      cachedAt: 1
    }
  );
  const revalidationFetchStarted = createDeferred();
  const allowFreshFetch = createDeferred();
  const legacyMatchObserved = createDeferred();
  const freshCommitted = createDeferred();
  const backgroundTasks = [];
  let currentStoredResponse = staleResponse.clone();
  let revalidationFetchCount = 0;
  let legacyMatchCount = 0;
  let staleWriteCount = 0;
  let freshWriteCount = 0;
  const edgeCache = {
    async match(request) {
      if (new URL(request.url).searchParams.has("transform")) {
        return currentStoredResponse ? currentStoredResponse.clone() : null;
      }
      legacyMatchCount += 1;
      legacyMatchObserved.resolve();
      return legacyResponse.clone();
    },
    async put(_request, response) {
      const html = await response.clone().text();
      if (html.includes("fresh-marker")) {
        freshWriteCount += 1;
        currentStoredResponse = response.clone();
        freshCommitted.resolve();
        return;
      }
      if (html.includes("legacy-marker")) {
        staleWriteCount += 1;
        await freshCommitted.promise;
        currentStoredResponse = response.clone();
        return;
      }
      throw new Error("unexpected remote shell cache write");
    }
  };
  const ctx = {
    waitUntil(task) {
      backgroundTasks.push(Promise.resolve(task));
    }
  };
  const render = () => renderRemoteAdminPage(
    new Request("https://worker.test/admin"),
    { ADMIN_PATH: "/admin" },
    ctx,
    { ok: true, missing: [] },
    remoteShellIndexUrl,
    { indexUrl: remoteShellIndexUrl, releaseTag: "v1.0.0" }
  );

  await withWorkerGlobals({
    caches: { default: edgeCache },
    fetch: async () => {
      revalidationFetchCount += 1;
      revalidationFetchStarted.resolve();
      await allowFreshFetch.promise;
      return new Response('<!doctype html><html><body><div id="app">fresh-marker</div></body></html>', {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
  }, async () => {
    const firstResponse = await render();
    assert.match(await firstResponse.text(), /stale-marker/);
    await revalidationFetchStarted.promise;

    currentStoredResponse = null;
    const secondResponsePromise = render();
    await legacyMatchObserved.promise;
    allowFreshFetch.resolve();

    const secondResponse = await secondResponsePromise;
    assert.match(await secondResponse.text(), /fresh-marker/);
    await Promise.all(backgroundTasks);
  });

  assert.equal(revalidationFetchCount, 1);
  assert.equal(legacyMatchCount, 1);
  assert.equal(staleWriteCount, 0);
  assert.equal(freshWriteCount, 1);
  assert.match(await currentStoredResponse.text(), /fresh-marker/);
  assert.equal(isolateState.SingleFlightTasks.size, 0);
  assert.equal(isolateState.AdminRemoteShellCacheMutationChains.size, 0);
});

test("304 refresh preserves representation and upstream validators", async () => {
  const previousHtml = '<!doctype html><html><head><script id="admin-tailwind-prelude">window.tailwind=window.tailwind||{};</script></head><body><div id="app"></div></body></html>';
  const previousResponse = buildAdminRemoteShellStoredResponse(previousHtml, {
    variantEtag: "browser-representation-v1",
    lastModified: "Wed, 01 Jul 2026 12:00:00 GMT",
    originEtag: "upstream-v1",
    originLastModified: "Tue, 30 Jun 2026 12:00:00 GMT",
    sourceUrl: "https://example.test/index.html",
    cachedAt: 1
  });
  const previousHeaders = new Headers(previousResponse.headers);
  let sentHeaders = null;

  await withWorkerGlobals({
    fetch: async (_url, init) => {
      sentHeaders = new Headers(init?.headers);
      return new Response(null, {
        status: 304,
        headers: {
          ETag: '"different-upstream-etag"',
          "Last-Modified": "Thu, 02 Jul 2026 12:00:00 GMT"
        }
      });
    }
  }, async () => {
    const payload = await fetchAdminRemoteShellStoredResponse(
      "https://example.test/index.html",
      { adminPath: "/admin" },
      { ok: true, missing: [] },
      previousResponse
    );
    const refreshedResponse = payload.storedResponse;

    assert.equal(await refreshedResponse.clone().text(), previousHtml);
    assert.equal(refreshedResponse.headers.get("ETag"), previousHeaders.get("ETag"));
    assert.equal(refreshedResponse.headers.get("Last-Modified"), previousHeaders.get("Last-Modified"));
    assert.equal(refreshedResponse.headers.get("X-Admin-Shell-Source-Etag"), previousHeaders.get("X-Admin-Shell-Source-Etag"));
    assert.equal(refreshedResponse.headers.get("X-Admin-Shell-Source-Last-Modified"), previousHeaders.get("X-Admin-Shell-Source-Last-Modified"));
    assert.notEqual(refreshedResponse.headers.get("X-Admin-Shell-Cached-At"), previousHeaders.get("X-Admin-Shell-Cached-At"));
  });

  assert.equal(sentHeaders.get("If-None-Match"), "upstream-v1");
  assert.equal(sentHeaders.get("If-Modified-Since"), "Tue, 30 Jun 2026 12:00:00 GMT");
});

test("cached remote shell route returns a stable conditional 304", async () => {
  isolateState.SingleFlightTasks.clear();
  const remoteShellIndexUrl = "https://example.test/releases/v1/index.html";
  const cachedResponse = buildAdminRemoteShellStoredResponse(
    '<!doctype html><html><body><div id="app">cached</div></body></html>',
    {
      variantEtag: "route-representation-etag",
      lastModified: "Wed, 01 Jul 2026 12:00:00 GMT",
      originEtag: "route-upstream-etag",
      originLastModified: "Tue, 30 Jun 2026 12:00:00 GMT",
      sourceUrl: remoteShellIndexUrl,
      cachedAt: Date.now()
    }
  );
  let cacheReadCount = 0;
  let fetchCount = 0;

  await withWorkerGlobals({
    caches: {
      default: {
        async match() {
          cacheReadCount += 1;
          return cachedResponse.clone();
        }
      }
    },
    fetch: async () => {
      fetchCount += 1;
      throw new Error("fresh cache must not revalidate");
    }
  }, async () => {
    const response = await renderRemoteAdminPage(
      new Request("https://worker.test/admin", {
        headers: { "If-None-Match": '"route-representation-etag"' }
      }),
      { ADMIN_PATH: "/admin" },
      null,
      { ok: true, missing: [] },
      remoteShellIndexUrl,
      { indexUrl: remoteShellIndexUrl, releaseTag: "v1.0.0" }
    );

    assert.equal(response.status, 304);
    assert.equal(response.headers.get("ETag"), '"route-representation-etag"');
    assert.equal(response.headers.get("Last-Modified"), null);
    assert.equal(await response.text(), "");
  });

  assert.equal(cacheReadCount, 1);
  assert.equal(fetchCount, 0);
  assert.equal(isolateState.SingleFlightTasks.size, 0);
});

test("remote shell does not reuse source Last-Modified for transformed representations", async () => {
  isolateState.SingleFlightTasks.clear();
  const remoteShellIndexUrl = "https://example.test/releases/v1/index.html";
  const cachedResponse = buildAdminRemoteShellStoredResponse(
    '<!doctype html><html><body><div id="app">new-bootstrap</div></body></html>',
    {
      variantEtag: "new-representation-etag",
      lastModified: "Wed, 01 Jul 2026 12:00:00 GMT",
      originLastModified: "Wed, 01 Jul 2026 12:00:00 GMT",
      sourceUrl: remoteShellIndexUrl,
      cachedAt: Date.now()
    }
  );

  await withWorkerGlobals({
    caches: {
      default: {
        async match() {
          return cachedResponse.clone();
        }
      }
    }
  }, async () => {
    const response = await renderRemoteAdminPage(
      new Request("https://worker.test/admin", {
        headers: { "If-Modified-Since": "Wed, 01 Jul 2026 12:00:00 GMT" }
      }),
      { ADMIN_PATH: "/admin" },
      null,
      { ok: true, missing: [] },
      remoteShellIndexUrl,
      { indexUrl: remoteShellIndexUrl, releaseTag: "v1.0.0" }
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Last-Modified"), null);
    assert.match(await response.text(), /new-bootstrap/);
  });
});

test("concurrent remote shell cold loads share one upstream fetch", async () => {
  isolateState.SingleFlightTasks.clear();
  const remoteShellIndexUrl = "https://example.test/releases/v1/index.html";
  const fetchGate = createDeferred();
  let upstreamFetchCount = 0;
  let cacheWriteCount = 0;
  const originalPatchOpsStatus = kernel.patchOpsStatus;
  kernel.patchOpsStatus = async () => null;

  try {
    await withWorkerGlobals({
      caches: {
        default: {
          async match() {
            return null;
          },
          async put() {
            cacheWriteCount += 1;
          }
        }
      },
      fetch: async () => {
        upstreamFetchCount += 1;
        await fetchGate.promise;
        return new Response('<!doctype html><html><body><div id="app"></div></body></html>', {
          headers: { "Content-Type": "text/html", ETag: '"v1"' }
        });
      }
    }, async () => {
      const requests = Array.from({ length: 6 }, () => renderRemoteAdminPage(
        new Request("https://worker.test/admin"),
        { ADMIN_PATH: "/admin" },
        null,
        { ok: true, missing: [] },
        remoteShellIndexUrl,
        { indexUrl: remoteShellIndexUrl, releaseTag: "v1.0.0" }
      ));
      await Promise.resolve();
      fetchGate.resolve();
      const responses = await Promise.all(requests);
      assert.deepEqual(responses.map(response => response.status), [200, 200, 200, 200, 200, 200]);
    });
  } finally {
    kernel.patchOpsStatus = originalPatchOpsStatus;
  }

  assert.equal(upstreamFetchCount, 1);
  assert.equal(cacheWriteCount, 1);
  assert.equal(isolateState.SingleFlightTasks.size, 0);
});

test("vendor warmup preserves order and limits concurrency", async () => {
  let activeCount = 0;
  let peakActiveCount = 0;
  const releaseNext = [];
  const entries = Array.from({ length: 8 }, (_, index) => ({ assetKey: `asset-${index}` }));
  const warmTask = warmAdminReleaseVendorEntries(entries, async (entry) => {
    activeCount += 1;
    peakActiveCount = Math.max(peakActiveCount, activeCount);
    await new Promise(resolve => releaseNext.push(resolve));
    activeCount -= 1;
    return entry.assetKey;
  });

  await Promise.resolve();
  assert.equal(activeCount, 3);
  while (releaseNext.length > 0) {
    releaseNext.shift()();
    await Promise.resolve();
  }
  const responses = await warmTask;

  assert.equal(peakActiveCount, 3);
  assert.deepEqual(responses, entries.map(entry => entry.assetKey));
});

test("admin warm subrequests are unconditional and treat cached 304 responses as success", () => {
  const request = buildAdminWarmSubrequest(new URL("https://worker.test/admin"));
  assert.equal(request.method, "HEAD");
  assert.equal(request.cache, "no-store");
  assert.equal(request.headers.get("If-None-Match"), null);
  assert.equal(request.headers.get("If-Modified-Since"), null);
  assert.equal(request.headers.get("Range"), null);
  assert.equal(isAdminWarmResponseSuccessful(new Response(null, { status: 200 })), true);
  assert.equal(isAdminWarmResponseSuccessful(new Response(null, { status: 304 })), true);
  assert.equal(isAdminWarmResponseSuccessful(new Response(null, { status: 502 })), false);
});

test("metadata cache keys partition identities without exposing credentials", async () => {
  const anonymousRequest = new Request("https://worker.test/nodes/alpha/Images/Primary?tag=v1");
  const firstIdentityRequest = new Request("https://worker.test/nodes/alpha/Images/Primary?api_key=secret-a&UserId=user-a&tag=v1", {
    headers: {
      "X-Emby-Token": "header-secret-a",
      "Cookie": "auth_token=admin-cookie; emby_session=session-a"
    }
  });
  const secondIdentityRequest = new Request("https://worker.test/nodes/alpha/Images/Primary?api_key=secret-b&UserId=user-b&tag=v1", {
    headers: { "X-Emby-Token": "header-secret-b" }
  });
  const [anonymousPartition, firstPartition, secondPartition] = await Promise.all([
    buildWorkerMetadataCacheIdentityPartition(anonymousRequest),
    buildWorkerMetadataCacheIdentityPartition(firstIdentityRequest),
    buildWorkerMetadataCacheIdentityPartition(secondIdentityRequest)
  ]);

  assert.match(anonymousPartition, /^[a-f0-9]{64}$/);
  assert.notEqual(firstPartition, secondPartition);
  assert.equal(hasWorkerMetadataPrivateIdentity(anonymousRequest), false);
  assert.equal(hasWorkerMetadataPrivateIdentity(firstIdentityRequest), true);

  const policyRevision = buildWorkerMetadataCachePolicyRevision("/Items/1/Images/Primary", {
    imageCacheMaxAge: 3600,
    prewarmCacheTtl: 120
  });
  const firstKey = buildCanonicalWorkerMetadataCacheKey(
    new URL(firstIdentityRequest.url),
    "alpha",
    "node-key",
    "/Items/1/Images/Primary",
    {
      search: new URL(firstIdentityRequest.url).search,
      nodeCacheRevision: "node-r1",
      entryMode: "kv_route",
      identityPartition: firstPartition,
      cachePolicyRevision: policyRevision
    }
  );
  const secondKey = buildCanonicalWorkerMetadataCacheKey(
    new URL(secondIdentityRequest.url),
    "alpha",
    "node-key",
    "/Items/1/Images/Primary",
    {
      search: new URL(secondIdentityRequest.url).search,
      nodeCacheRevision: "node-r1",
      entryMode: "kv_route",
      identityPartition: secondPartition,
      cachePolicyRevision: policyRevision
    }
  );

  assert.ok(firstKey instanceof Request);
  assert.ok(secondKey instanceof Request);
  assert.notEqual(firstKey.url, secondKey.url);
  assert.doesNotMatch(firstKey.url, /secret-a|header-secret-a|session-a|user-a/);
  assert.equal(buildCanonicalWorkerMetadataCacheKey(firstIdentityRequest.url, "alpha", "node-key", "/Items/1/Images/Primary"), null);
});

test("metadata prewarm partitions each target's sensitive query", async () => {
  const sourceRequest = new Request("https://worker.test/alpha/Items", {
    headers: {
      "X-Emby-Token": "shared-header-secret",
      "Cookie": "emby_session=shared-session"
    }
  });
  const [firstPartition, secondPartition] = await Promise.all([
    buildWorkerMetadataPrewarmIdentityPartition(
      sourceRequest,
      new URL("https://origin.test/Items/1/Images/Primary?api_key=target-secret-a&tag=v1")
    ),
    buildWorkerMetadataPrewarmIdentityPartition(
      sourceRequest,
      new URL("https://origin.test/Items/1/Images/Primary?api_key=target-secret-b&tag=v1")
    )
  ]);

  assert.match(firstPartition, /^[a-f0-9]{64}$/);
  assert.notEqual(firstPartition, secondPartition);
  assert.doesNotMatch(firstPartition, /target-secret|shared-header-secret|shared-session/);
});

test("metadata cache policy revisions change with TTL and asset kind", () => {
  const imageHour = buildWorkerMetadataCachePolicyRevision("/Items/1/Images/Primary", {
    imageCacheMaxAge: 3600,
    prewarmCacheTtl: 120
  });
  const imageDisabled = buildWorkerMetadataCachePolicyRevision("/Items/1/Images/Primary", {
    imageCacheMaxAge: 0,
    prewarmCacheTtl: 120
  });
  const manifest = buildWorkerMetadataCachePolicyRevision("/Videos/1/main.m3u8", {
    imageCacheMaxAge: 3600,
    prewarmCacheTtl: 120
  });

  assert.notEqual(imageHour, imageDisabled);
  assert.notEqual(imageHour, manifest);
});

test("metadata cache lookups preserve supported request conditions and bypass If-Range", () => {
  const cacheKey = new Request("https://worker-cache.test/item?identity=abc");
  const sourceRequest = new Request("https://worker.test/item", {
    headers: {
      "Range": "bytes=10-19",
      "If-None-Match": '"etag-v1"',
      "If-Modified-Since": "Sun, 12 Jul 2026 00:00:00 GMT"
    }
  });
  const lookupRequest = buildWorkerMetadataCacheLookupRequest(cacheKey, sourceRequest);

  assert.ok(lookupRequest instanceof Request);
  assert.equal(lookupRequest.url, cacheKey.url);
  assert.equal(lookupRequest.headers.get("Range"), "bytes=10-19");
  assert.equal(lookupRequest.headers.get("If-None-Match"), '"etag-v1"');
  assert.equal(lookupRequest.headers.get("If-Modified-Since"), "Sun, 12 Jul 2026 00:00:00 GMT");
  assert.equal(buildWorkerMetadataCacheLookupRequest(cacheKey, new Request("https://worker.test/item", {
    headers: { "If-Range": '"etag-v1"', "Range": "bytes=10-19" }
  })), null);
});

test("private metadata responses stay browser-private and upstream fetch bypasses shared cache", async () => {
  const privateRequest = new Request("https://worker.test/Items/1/Images/Primary", {
    headers: { "X-Emby-Token": "secret-token" }
  });
  const publicRequest = new Request("https://worker.test/Items/1/Images/Primary");
  const requestTraits = {
    isImage: true,
    isStaticFile: false,
    isSubtitle: false,
    isManifest: false,
    isMetadataCacheable: true,
    isBigStream: false,
    isSmartStrmMedia: false,
    isSegment: false
  };
  const privateHeaders = proxyService.buildProxyResponseHeaders(
    new Response("image"),
    privateRequest,
    {},
    "*",
    requestTraits,
    { imageCacheMaxAge: 3600 }
  );
  const publicHeaders = proxyService.buildProxyResponseHeaders(
    new Response("image"),
    publicRequest,
    {},
    "*",
    requestTraits,
    { imageCacheMaxAge: 3600 }
  );
  assert.equal(privateHeaders.get("Cache-Control"), "private, max-age=3600");
  assert.equal(publicHeaders.get("Cache-Control"), "public, max-age=3600");

  const buildFetchOptions = proxyService.createBuildFetchOptions({
    request: privateRequest,
    requestMethod: "GET",
    requestTraits,
    protocolFallback: true
  }, {
    newHeaders: new Headers(privateRequest.headers),
    adminCustomHeaders: new Set(),
    preparedBody: null,
    preparedBodyMode: "none"
  });
  const fetchOptions = await buildFetchOptions(new URL("https://origin.test/Items/1/Images/Primary"));
  assert.equal(fetchOptions.cache, "no-store");
  assert.equal(Object.hasOwn(fetchOptions, "cf"), false);
});

test("single-flight deduplicates equal keys while distinct keys run independently", async () => {
  isolateState.SingleFlightTasks.clear();
  const sharedGate = createDeferred();
  let sharedLoadCount = 0;
  const first = runSingleFlight("test:shared", async () => {
    sharedLoadCount += 1;
    return sharedGate.promise;
  });
  const second = runSingleFlight("test:shared", async () => {
    sharedLoadCount += 1;
    return "unexpected";
  });
  await Promise.resolve();
  assert.equal(sharedLoadCount, 1);
  sharedGate.resolve("shared-result");
  assert.deepEqual(await Promise.all([first, second]), ["shared-result", "shared-result"]);

  const runningKeys = [];
  const [left, right] = await Promise.all([
    runSingleFlight("test:left", async () => {
      runningKeys.push("left");
      await Promise.resolve();
      return "left";
    }),
    runSingleFlight("test:right", async () => {
      runningKeys.push("right");
      await Promise.resolve();
      return "right";
    })
  ]);
  assert.deepEqual(new Set(runningKeys), new Set(["left", "right"]));
  assert.deepEqual([left, right], ["left", "right"]);
});

test("single-flight rejection clears the key for a later retry", async () => {
  isolateState.SingleFlightTasks.clear();
  let loadCount = 0;
  await assert.rejects(
    runSingleFlight("test:retry", async () => {
      loadCount += 1;
      throw new Error("first attempt failed");
    }),
    /first attempt failed/
  );
  assert.equal(isolateState.SingleFlightTasks.has("test:retry"), false);

  const retriedValue = await runSingleFlight("test:retry", async () => {
    loadCount += 1;
    return "recovered";
  });
  assert.equal(retriedValue, "recovered");
  assert.equal(loadCount, 2);
  assert.equal(isolateState.SingleFlightTasks.has("test:retry"), false);
});

test("runtime route context normalizes hostnames once and defers CORS headers", async () => {
  const request = new Request("https://Node.Media.Example.COM./Videos/1/stream", {
    headers: { Origin: "https://client.test" }
  });
  const NativeHeaders = Headers;
  let headersConstructionCount = 0;

  await withWorkerGlobals({
    Headers: class CountingHeaders extends NativeHeaders {
      constructor(init) {
        super(init);
        headersConstructionCount += 1;
      }
    }
  }, async () => {
    const routeContext = routeTesting.buildFetchRouteContext(request, {
      HOST: "Media.Example.COM.",
      LEGACY_HOST: "Legacy.Example.COM.",
      ADMIN_PASS: "test-password",
      JWT_SECRET: "test-secret"
    });

    assert.equal(routeContext.requestHost, "node.media.example.com");
    assert.equal(routeContext.configuredHost, "media.example.com");
    assert.equal(routeContext.configuredLegacyHost, "legacy.example.com");
    assert.equal(Object.hasOwn(routeContext, "requestHostLower"), false);
    assert.equal(Object.hasOwn(routeContext, "dynamicCors"), false);
    assert.equal(headersConstructionCount, 0);

    const response = routeTesting.buildRouteCorsResponse(request, {}, "Not Found", 404);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://client.test");
    assert.equal(response.headers.get("Vary"), "Origin");
    assert.equal(headersConstructionCount, 1);
  });
});

test("proxy access rules reuse one parsed profile per runtime config object", () => {
  const runtimeConfig = {
    corsOrigins: " https://client-a.test, https://client-b.test,https://client-a.test ",
    ipBlacklist: "198.51.100.1, 198.51.100.2",
    geoAllowlist: "us, ca",
    geoBlocklist: "kp"
  };
  const firstProfile = buildProxyAccessRuleProfile(runtimeConfig);
  const secondProfile = buildProxyAccessRuleProfile(runtimeConfig);

  assert.equal(secondProfile, firstProfile);
  assert.deepEqual(firstProfile.corsOrigins, ["https://client-a.test", "https://client-b.test"]);
  assert.equal(
    proxyService.resolveCorsOrigin(runtimeConfig, new Request("https://worker.test", {
      headers: { Origin: "https://client-b.test" }
    })),
    "https://client-b.test"
  );
  assert.equal(proxyService.evaluateFirewall(runtimeConfig, "198.51.100.1", "US", "*")?.status, 403);
  assert.equal(proxyService.evaluateFirewall(runtimeConfig, "203.0.113.1", "US", "*"), null);
  assert.equal(proxyService.evaluateFirewall(runtimeConfig, "203.0.113.1", "FR", "*")?.status, 403);

  runtimeConfig.geoBlocklist = "US";
  const updatedProfile = buildProxyAccessRuleProfile(runtimeConfig);
  assert.notEqual(updatedProfile, firstProfile);
  assert.equal(proxyService.evaluateFirewall(runtimeConfig, "203.0.113.1", "US", "*")?.status, 403);
});

test("playback-critical route detection preserves encoded and link-variant paths", () => {
  const playbackRoutes = [
    ["node", "Videos", "1", "stream"],
    ["node", "__proxy-a", "Videos", "1", "stream.m3u8"],
    ["node", "__PROXY-B", "Items", "1", "download"],
    ["node", "Videos", "1", "stream%2Em3u8"],
    ["legacy", "node", "Videos", "1", "stream"]
  ];
  const nonPlaybackRoutes = [
    ["node", "webhooks", "events"],
    ["node", "Items", "1"],
    ["node", "__proxy-a", "api", "system", "info"]
  ];

  for (const segments of playbackRoutes) {
    assert.equal(routeTesting.isPlaybackCriticalRouteContext({ segments }), true, segments.join("/"));
  }
  for (const segments of nonPlaybackRoutes) {
    assert.equal(routeTesting.isPlaybackCriticalRouteContext({ segments }), false, segments.join("/"));
  }
});

test("Emby Web proxy boundary rejects only the exact web subtree", async () => {
  const webPaths = [
    "/web",
    "/web/",
    "/WEB/index.html",
    "/web/app.js",
    "/web/image.png",
    "/web%2Findex.html",
    "/web%5Cindex.html",
    "/%57eb/index.html",
    "/%2557eb%252Findex.html",
    "/%252557eb/index.html",
    "/web%25252Findex.html",
    "/foo/%2e%2e/web/index.html",
    "/web%2Findex%ZZ.html",
    "/%77eb/%ZZ/app.js"
  ];
  const nonWebPaths = [
    "/websocket",
    "/websocket/events",
    "/webhooks",
    "/webhooks/events",
    "/web-api",
    "/webby",
    "/api/web",
    "/Items",
    "/Videos/1/stream"
  ];
  for (const proxyPath of webPaths) assert.equal(isEmbyWebProxyPath(proxyPath), true, proxyPath);
  for (const proxyPath of nonWebPaths) assert.equal(isEmbyWebProxyPath(proxyPath), false, proxyPath);

  let upstreamFetchCount = 0;
  await withWorkerGlobals({
    fetch: async () => {
      upstreamFetchCount += 1;
      return new Response("unexpected upstream response");
    }
  }, async () => {
    for (const proxyPath of webPaths) {
      const request = new Request("https://worker.test/node/secret?backup=1", {
        headers: {
          Cookie: "emby_web_bypass=1",
          Origin: "https://client.test"
        }
      });
      const response = await proxyService.handle(
        request,
        null,
        proxyPath,
        "node",
        "secret",
        {},
        null,
        { runtimeConfig: { rateLimitRpm: 0 } }
      );
      assert.equal(response.status, 404, proxyPath);
      assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
      assert.equal(response.headers.get("Location"), null);
      assert.equal(response.headers.get("Set-Cookie"), null);
      assert.equal(response.headers.get("Vary"), "Origin");
      assert.equal(await response.text(), "Not Found");
    }

    for (const method of ["HEAD", "OPTIONS", "POST"]) {
      const request = new Request("https://worker.test/node/secret?backup=1", {
        method,
        headers: { Cookie: "emby_web_bypass=1" }
      });
      const response = await proxyService.handle(request, null, "/web", "node", "secret", {}, null, {
        runtimeConfig: { rateLimitRpm: 0 }
      });
      assert.equal(response.status, 404, method);
      assert.equal(await response.text(), method === "HEAD" ? "" : "Not Found");
    }
  });
  assert.equal(upstreamFetchCount, 0);

  const encodedWebRelayTarget = Buffer.from("https://origin.test/web/index.html", "utf8").toString("base64url");
  let relayFetchCount = 0;
  await withWorkerGlobals({
    fetch: async () => {
      relayFetchCount += 1;
      return new Response("unexpected relay response");
    }
  }, async () => {
    for (const relayVisiblePath of ["/web/index.html", "/Items/1"]) {
      const proxyPath = `/__playback-relay${relayVisiblePath}`;
      const request = new Request(
        `https://worker.test/node/secret${proxyPath}?__pb_target=${encodeURIComponent(encodedWebRelayTarget)}`
      );
      const response = await proxyService.handle(
        request,
        { target: "https://origin.test" },
        proxyPath,
        "node",
        "secret",
        {},
        { waitUntil() {} },
        { requestUrl: new URL(request.url), runtimeConfig: { rateLimitRpm: 0 } }
      );
      assert.equal(response.status, 404, relayVisiblePath);
      assert.equal(await response.text(), "Not Found");
    }
  });
  assert.equal(relayFetchCount, 0);

  let redirectFetchCount = 0;
  await withWorkerGlobals({
    fetch: async (url) => {
      redirectFetchCount += 1;
      assert.equal(new URL(url).pathname, redirectFetchCount === 1 ? "/emby/" : "/web/index.html");
      if (redirectFetchCount === 1) return new Response(null, { status: 302, headers: { Location: "/web/index.html" } });
      return new Response("unexpected web response");
    }
  }, async () => {
    const request = new Request("https://worker.test/node/secret/");
    const response = await proxyService.handle(
      request,
      { target: "https://origin.test/emby" },
      "/",
      "node",
      "secret",
      {},
      { waitUntil() {} },
      { requestUrl: new URL(request.url), runtimeConfig: { rateLimitRpm: 0 } }
    );
    assert.equal(response.status, 404);
    assert.match(response.headers.get("Cache-Control") || "", /^no-store/);
    assert.equal(await response.text(), "Not Found");
  });
  assert.equal(redirectFetchCount, 1);

  let playbackFallbackFetchCount = 0;
  await withWorkerGlobals({
    fetch: async (url) => {
      playbackFallbackFetchCount += 1;
      assert.equal(new URL(url).pathname, "/Videos/1/stream");
      return new Response(null, { status: 302, headers: { Location: "/web/index.html" } });
    }
  }, async () => {
    const request = new Request("https://worker.test/node/secret/Videos/1/stream?__pb_abs=1");
    const response = await proxyService.handle(
      request,
      { target: "https://origin.test" },
      "/Videos/1/stream",
      "node",
      "secret",
      {},
      { waitUntil() {} },
      { requestUrl: new URL(request.url), runtimeConfig: { rateLimitRpm: 0 } }
    );
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Location"), null);
    assert.equal(await response.text(), "Not Found");
  });
  assert.equal(playbackFallbackFetchCount, 1);

  let rangeProbeFetchCount = 0;
  let rangeProbeBodyCancelCount = 0;
  await withWorkerGlobals({
    fetch: async (url, init = {}) => {
      rangeProbeFetchCount += 1;
      assert.equal(new URL(url).pathname, "/Videos/1/stream");
      assert.equal(init.method, "HEAD");
      const body = new ReadableStream({
        cancel() { rangeProbeBodyCancelCount += 1; }
      });
      return new Response(body, { status: 302, headers: { Location: "/web/index.html" } });
    }
  }, async () => {
    const request = new Request("https://worker.test/node/secret/Videos/1/stream", {
      headers: { Range: "bytes=0-1023" }
    });
    const response = await proxyService.handle(
      request,
      { target: "https://origin.test", mainVideoStreamMode: "direct" },
      "/Videos/1/stream",
      "node",
      "secret",
      {},
      { waitUntil() {} },
      { requestUrl: new URL(request.url), runtimeConfig: { rateLimitRpm: 0 } }
    );
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Location"), null);
    assert.equal(await response.text(), "Not Found");
  });
  assert.equal(rangeProbeFetchCount, 1);
  assert.equal(rangeProbeBodyCancelCount, 1);

  let allowedRedirectFetchCount = 0;
  await withWorkerGlobals({
    fetch: async (url) => {
      allowedRedirectFetchCount += 1;
      const pathname = new URL(url).pathname;
      if (allowedRedirectFetchCount === 1) {
        assert.equal(pathname, "/");
        return new Response(null, { status: 302, headers: { Location: "/webhooks/events" } });
      }
      assert.equal(pathname, "/webhooks/events");
      return new Response("allowed non-web redirect");
    }
  }, async () => {
    const request = new Request("https://worker.test/node/secret/");
    const response = await proxyService.handle(
      request,
      { target: "https://origin.test" },
      "/",
      "node",
      "secret",
      {},
      { waitUntil() {} },
      { requestUrl: new URL(request.url), runtimeConfig: { rateLimitRpm: 0 } }
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "allowed non-web redirect");
  });
  assert.equal(allowedRedirectFetchCount, 2);
});

test("runtime config refresh is single-flight and cached by namespace", async () => {
  isolateState.SingleFlightTasks.clear();
  invalidateRuntimeConfigCache();
  const loadGate = createDeferred();
  const loadStarted = createDeferred();
  let configReadCount = 0;
  let configWriteCount = 0;
  const kv = {
    async get(key) {
      assert.equal(key, kernel.CONFIG_KEY);
      configReadCount += 1;
      loadStarted.resolve();
      await loadGate.promise;
      return { rateLimitRpm: 321, enableH2: true };
    },
    async put() { configWriteCount += 1; }
  };
  const env = { ENI_KV: kv, __CONFIG_CACHE_NAMESPACE: "runtime-config-single-flight" };

  const firstLoad = getRuntimeConfig(env);
  const secondLoad = getRuntimeConfig(env);
  await loadStarted.promise;
  assert.equal(configReadCount, 1);
  loadGate.resolve();

  const [firstConfig, secondConfig] = await Promise.all([firstLoad, secondLoad]);
  assert.equal(firstConfig, secondConfig);
  assert.equal(firstConfig.rateLimitRpm, 321);
  assert.equal(await getRuntimeConfig(env), firstConfig);
  assert.equal(configReadCount, 1);
  assert.equal(configWriteCount, 0);
  assert.equal(isolateState.SingleFlightTasks.size, 0);
  invalidateRuntimeConfigCache();
});

test("runtime config invalidation prevents an older load from restoring stale cache", async () => {
  isolateState.SingleFlightTasks.clear();
  invalidateRuntimeConfigCache();
  const oldLoadGate = createDeferred();
  const oldLoadStarted = createDeferred();
  let configReadCount = 0;
  const kv = {
    async get() {
      configReadCount += 1;
      if (configReadCount === 1) {
        oldLoadStarted.resolve();
        await oldLoadGate.promise;
        return { rateLimitRpm: 100 };
      }
      return { rateLimitRpm: 200 };
    },
    async put() {}
  };
  const env = { ENI_KV: kv, __CONFIG_CACHE_NAMESPACE: "runtime-config-invalidation" };

  const oldLoad = getRuntimeConfig(env);
  await oldLoadStarted.promise;
  assert.equal(configReadCount, 1);
  invalidateRuntimeConfigCache();
  const freshConfig = await getRuntimeConfig(env);
  assert.equal(freshConfig.rateLimitRpm, 200);

  oldLoadGate.resolve();
  const oldConfig = await oldLoad;
  assert.equal(oldConfig.rateLimitRpm, 100);
  assert.equal(isolateState.ConfigCache.data.rateLimitRpm, 200);
  assert.equal(configReadCount, 2);
  invalidateRuntimeConfigCache();
});

test("runtime config caches are isolated by KV binding without an explicit namespace", async () => {
  invalidateRuntimeConfigCache();
  let firstReads = 0;
  let secondReads = 0;
  const firstEnv = {
    ENI_KV: {
      async get() {
        firstReads += 1;
        return { rateLimitRpm: 111 };
      }
    }
  };
  const secondEnv = {
    ENI_KV: {
      async get() {
        secondReads += 1;
        return { rateLimitRpm: 222 };
      }
    }
  };

  assert.equal((await getRuntimeConfig(firstEnv)).rateLimitRpm, 111);
  assert.equal((await getRuntimeConfig(secondEnv)).rateLimitRpm, 222);
  assert.equal((await getRuntimeConfig(firstEnv)).rateLimitRpm, 111);
  assert.equal((await getRuntimeConfig(secondEnv)).rateLimitRpm, 222);
  assert.equal(firstReads, 1);
  assert.equal(secondReads, 1);

  invalidateRuntimeConfigCache(firstEnv);
  assert.equal((await getRuntimeConfig(firstEnv)).rateLimitRpm, 111);
  assert.equal((await getRuntimeConfig(secondEnv)).rateLimitRpm, 222);
  assert.equal(firstReads, 2);
  assert.equal(secondReads, 1);
  invalidateRuntimeConfigCache();
});

test("runtime config namespaces remain isolated within one KV binding", async () => {
  invalidateRuntimeConfigCache();
  let reads = 0;
  const kv = {
    async get() {
      reads += 1;
      return { rateLimitRpm: reads === 1 ? 101 : 202 };
    }
  };
  const firstEnv = { ENI_KV: kv, __CONFIG_CACHE_NAMESPACE: "first" };
  const secondEnv = { ENI_KV: kv, __CONFIG_CACHE_NAMESPACE: "second" };

  assert.equal((await getRuntimeConfig(firstEnv)).rateLimitRpm, 101);
  assert.equal((await getRuntimeConfig(secondEnv)).rateLimitRpm, 202);
  assert.equal((await getRuntimeConfig(firstEnv)).rateLimitRpm, 101);
  assert.equal((await getRuntimeConfig(secondEnv)).rateLimitRpm, 202);
  assert.equal(reads, 2);
  invalidateRuntimeConfigCache();
});

test("KV mutation queues serialize one binding without blocking another", async () => {
  resetRuntimeBindingStates();
  const sharedBinding = {};
  const otherBinding = {};
  const firstStarted = createDeferred();
  const releaseFirst = createDeferred();
  const otherStarted = createDeferred();
  const events = [];

  const first = runKvDataMutation(async () => {
    events.push("first:start");
    firstStarted.resolve();
    await releaseFirst.promise;
    events.push("first:end");
  }, sharedBinding);
  const second = runKvDataMutation(async () => {
    events.push("second:start");
    events.push("second:end");
  }, sharedBinding);
  const other = runKvDataMutation(async () => {
    events.push("other:start");
    otherStarted.resolve();
    events.push("other:end");
  }, otherBinding);

  await Promise.all([firstStarted.promise, otherStarted.promise]);
  assert.deepEqual(events, ["first:start", "other:start", "other:end"]);
  releaseFirst.resolve();
  await Promise.all([first, second, other]);
  assert.deepEqual(events, ["first:start", "other:start", "other:end", "first:end", "second:start", "second:end"]);
  resetRuntimeBindingStates();
});

test("runtime config writes roll back when metadata persistence fails", async () => {
  isolateState.SingleFlightTasks.clear();
  invalidateRuntimeConfigCache();
  const storedValues = new Map([[kernel.CONFIG_KEY, JSON.stringify({ rateLimitRpm: 10 })]]);
  let metadataFailurePending = true;
  const kv = {
    async get(key, options = {}) {
      const value = storedValues.get(key);
      if (value === undefined) return null;
      return options.type === "json" ? JSON.parse(value) : value;
    },
    async put(key, value) {
      if (key === kernel.CONFIG_META_KEY && metadataFailurePending) {
        metadataFailurePending = false;
        throw new Error("metadata maintenance failed");
      }
      storedValues.set(key, String(value));
    },
    async delete(key) {
      storedValues.delete(key);
    }
  };
  const env = { ENI_KV: kv, __CONFIG_CACHE_NAMESPACE: "runtime-config-prime" };
  await getRuntimeConfig(env);

  await assert.rejects(
    kernel.persistRuntimeConfig({ rateLimitRpm: 20 }, { env, kv }),
    /metadata maintenance failed/
  );

  assert.equal(JSON.parse(storedValues.get(kernel.CONFIG_KEY)).rateLimitRpm, 10);
  assert.equal(storedValues.has(kernel.CONFIG_SNAPSHOTS_KEY), false);
  assert.equal(storedValues.has(kernel.CONFIG_SNAPSHOTS_META_KEY), false);
  invalidateRuntimeConfigCache();
  assert.equal((await getRuntimeConfig(env)).rateLimitRpm, 10);
  invalidateRuntimeConfigCache();
});

test("host-prefix CNAME targets normalize at config and node boundaries", async () => {
  const { kv } = createInMemoryKvStore({ [kernel.CONFIG_KEY]: {} });
  const env = { ENI_KV: kv, __CONFIG_CACHE_NAMESPACE: "host-prefix-normalize" };
  const config = await kernel.persistRuntimeConfig({
    defaultHostPrefixCnameTarget: "  Global.Target.Example.  "
  }, { env, kv });
  assert.equal(config.defaultHostPrefixCnameTarget, "global.target.example");

  const hostPrefixNode = kernel.normalizeNode("alpha", {
    target: "https://origin.test",
    entryMode: "host_prefix",
    hostPrefixCnameTarget: "  Node.Target.Example.  "
  }).data;
  assert.equal(hostPrefixNode.hostPrefixCnameTarget, "node.target.example");

  const kvRouteNode = kernel.normalizeNode("alpha", {
    target: "https://origin.test",
    entryMode: "kv_route",
    hostPrefixCnameTarget: "node.target.example"
  }).data;
  assert.equal(kvRouteNode.hostPrefixCnameTarget, "");
});

test("invalid global host-prefix CNAME targets are rejected before persistence", async () => {
  const { kv } = createInMemoryKvStore({ [kernel.CONFIG_KEY]: {} });
  const env = { ENI_KV: kv, __CONFIG_CACHE_NAMESPACE: "host-prefix-invalid" };
  const invalidTargets = [
    "https://target.example",
    "target.example:443",
    "target.example/path",
    "*.target.example",
    "target example",
    "192.0.2.1"
  ];

  for (const defaultHostPrefixCnameTarget of invalidTargets) {
    await assert.rejects(
      kernel.persistRuntimeConfig({ defaultHostPrefixCnameTarget }, { env, kv }),
      error => error?.code === "HOST_PREFIX_CNAME_TARGET_INVALID"
        && error?.details?.field === "defaultHostPrefixCnameTarget"
    );
  }
});

test("host-prefix CNAME target priority is node then global then HOST", () => {
  const hostRoot = "proxy.example";
  const inheritedNode = { target: "https://origin.test", entryMode: "host_prefix" };
  const overriddenNode = {
    ...inheritedNode,
    hostPrefixCnameTarget: "node.target.example"
  };

  const nodeOverridePlan = kernel.buildHostPrefixDnsSyncPlan(
    "",
    null,
    "alpha",
    overriddenNode,
    hostRoot,
    { nextConfig: { defaultHostPrefixCnameTarget: "global.target.example" } }
  );
  assert.equal(nodeOverridePlan.nextCnameTarget, "node.target.example");

  const globalDefaultPlan = kernel.buildHostPrefixDnsSyncPlan(
    "",
    null,
    "alpha",
    inheritedNode,
    hostRoot,
    { nextConfig: { defaultHostPrefixCnameTarget: "global.target.example" } }
  );
  assert.equal(globalDefaultPlan.nextCnameTarget, "global.target.example");

  const hostFallbackPlan = kernel.buildHostPrefixDnsSyncPlan(
    "",
    null,
    "alpha",
    inheritedNode,
    hostRoot
  );
  assert.equal(hostFallbackPlan.nextCnameTarget, hostRoot);
});

test("host-prefix DNS plans carry forward and rollback CNAME targets", () => {
  const node = { target: "https://origin.test", entryMode: "host_prefix" };
  const plan = kernel.buildHostPrefixDnsSyncPlan(
    "alpha",
    node,
    "alpha",
    node,
    "proxy.example",
    {
      previousConfig: { defaultHostPrefixCnameTarget: "old.target.example" },
      nextConfig: { defaultHostPrefixCnameTarget: "new.target.example" }
    }
  );

  assert.equal(plan.previousDnsHost, "alpha.proxy.example");
  assert.equal(plan.nextDnsHost, "alpha.proxy.example");
  assert.equal(plan.previousCnameTarget, "old.target.example");
  assert.equal(plan.nextCnameTarget, "new.target.example");
  assert.deepEqual(plan.steps, [{
    type: "upsert",
    host: "alpha.proxy.example",
    cnameTarget: "new.target.example"
  }]);
  assert.deepEqual(plan.rollbackSteps, [{
    type: "upsert",
    host: "alpha.proxy.example",
    cnameTarget: "old.target.example"
  }]);
});

test("node summaries retain host-prefix CNAME overrides without changing proxy cache revision", () => {
  const baseNode = {
    target: "https://origin.test",
    entryMode: "host_prefix"
  };
  const firstSummary = kernel.buildNodeSummary("alpha", {
    ...baseNode,
    hostPrefixCnameTarget: "First.Target.Example."
  }).summary;
  const secondSummary = kernel.buildNodeSummary("alpha", {
    ...baseNode,
    hostPrefixCnameTarget: "second.target.example"
  }).summary;

  assert.equal(firstSummary.hostPrefixCnameTarget, "first.target.example");
  assert.equal(secondSummary.hostPrefixCnameTarget, "second.target.example");
  assert.equal(firstSummary.cacheRevision, secondSummary.cacheRevision);
});

test("global host-prefix CNAME changes sync only nodes that inherit the default", async () => {
  const previousConfig = {
    defaultHostPrefixCnameTarget: "old.target.example",
    cfZoneId: "zone-id",
    cfApiToken: "api-token"
  };
  const { kv, storedValues } = createInMemoryKvStore({
    [kernel.CONFIG_KEY]: previousConfig,
    [`${kernel.PREFIX}inherited`]: {
      target: "https://inherited-origin.test",
      entryMode: "host_prefix"
    },
    [`${kernel.PREFIX}overridden`]: {
      target: "https://overridden-origin.test",
      entryMode: "host_prefix",
      hostPrefixCnameTarget: "node.target.example"
    },
    [`${kernel.PREFIX}path-node`]: {
      target: "https://path-origin.test",
      entryMode: "kv_route"
    }
  });
  const env = {
    ENI_KV: kv,
    HOST: "proxy.example",
    __CONFIG_CACHE_NAMESPACE: "cname-global-sync-success"
  };
  const dnsPlans = [];
  const originalPersistHostPrefixDnsSyncPlan = kernel.persistHostPrefixDnsSyncPlan;
  kernel.persistHostPrefixDnsSyncPlan = async (plan) => {
    dnsPlans.push(structuredClone(plan));
    return { changed: true };
  };
  invalidateRuntimeConfigCache();

  try {
    const savedConfig = await kernel.persistRuntimeConfig({
      ...previousConfig,
      defaultHostPrefixCnameTarget: "new.target.example"
    }, { env, kv });

    assert.equal(savedConfig.defaultHostPrefixCnameTarget, "new.target.example");
    assert.deepEqual(dnsPlans.map(plan => plan.steps), [[{
      type: "upsert",
      host: "inherited.proxy.example",
      cnameTarget: "new.target.example"
    }]]);
    assert.equal(
      JSON.parse(storedValues.get(kernel.CONFIG_KEY)).defaultHostPrefixCnameTarget,
      "new.target.example"
    );
  } finally {
    kernel.persistHostPrefixDnsSyncPlan = originalPersistHostPrefixDnsSyncPlan;
    invalidateRuntimeConfigCache();
  }
});

test("global host-prefix CNAME sync rolls back earlier DNS updates before config persistence", async () => {
  const previousConfig = {
    defaultHostPrefixCnameTarget: "old.target.example",
    cfZoneId: "zone-id",
    cfApiToken: "api-token"
  };
  const { kv, storedValues, putKeys } = createInMemoryKvStore({
    [kernel.CONFIG_KEY]: previousConfig,
    [`${kernel.PREFIX}alpha`]: {
      target: "https://alpha-origin.test",
      entryMode: "host_prefix"
    },
    [`${kernel.PREFIX}beta`]: {
      target: "https://beta-origin.test",
      entryMode: "host_prefix"
    }
  });
  const env = {
    ENI_KV: kv,
    HOST: "proxy.example",
    __CONFIG_CACHE_NAMESPACE: "cname-global-sync-rollback"
  };
  const dnsSteps = [];
  let forwardPlanCount = 0;
  const originalPersistHostPrefixDnsSyncPlan = kernel.persistHostPrefixDnsSyncPlan;
  kernel.persistHostPrefixDnsSyncPlan = async (plan) => {
    const steps = structuredClone(plan.steps || []);
    dnsSteps.push(steps);
    if (steps[0]?.cnameTarget === "new.target.example") {
      forwardPlanCount += 1;
      if (forwardPlanCount === 2) throw new Error("beta_dns_update_failed");
    }
    return { changed: true };
  };
  invalidateRuntimeConfigCache();

  try {
    await assert.rejects(
      kernel.persistRuntimeConfig({
        ...previousConfig,
        defaultHostPrefixCnameTarget: "new.target.example"
      }, { env, kv }),
      error => error?.message === "beta_dns_update_failed"
        && error?.details?.hostPrefixDnsSyncedCount === 1
        && error?.details?.failedHostPrefixDnsHost === "beta.proxy.example"
        && error?.details?.rollbackAttempted === true
        && error?.details?.rollbackSucceeded === true
    );

    assert.deepEqual(dnsSteps, [
      [{
        type: "upsert",
        host: "alpha.proxy.example",
        cnameTarget: "new.target.example"
      }],
      [{
        type: "upsert",
        host: "beta.proxy.example",
        cnameTarget: "new.target.example"
      }],
      [{
        type: "upsert",
        host: "beta.proxy.example",
        cnameTarget: "old.target.example"
      }],
      [{
        type: "upsert",
        host: "alpha.proxy.example",
        cnameTarget: "old.target.example"
      }]
    ]);
    assert.equal(
      JSON.parse(storedValues.get(kernel.CONFIG_KEY)).defaultHostPrefixCnameTarget,
      "old.target.example"
    );
    assert.equal(storedValues.has(kernel.CONFIG_SNAPSHOTS_KEY), false);
    assert.equal(putKeys.includes(kernel.CONFIG_KEY), false);
    assert.equal(putKeys.includes(kernel.CONFIG_SNAPSHOTS_KEY), false);
  } finally {
    kernel.persistHostPrefixDnsSyncPlan = originalPersistHostPrefixDnsSyncPlan;
    invalidateRuntimeConfigCache();
  }
});

test("CNAME sync restores the complete host snapshot after a partial delete failure", async () => {
  const initialRecords = [
    { id: "a-1", name: "alpha.proxy.example", type: "A", content: "192.0.2.10", ttl: 120, proxied: false },
    { id: "aaaa-1", name: "alpha.proxy.example", type: "AAAA", content: "2001:db8::10", ttl: 300, proxied: false }
  ];
  const dns = createCloudflareDnsFetch(initialRecords, {
    failMutationAt: 2,
    failureMessage: "second_delete_failed"
  });
  const { kv } = createInMemoryKvStore();

  await withWorkerGlobals({ fetch: dns.fetch }, async () => {
    await assert.rejects(
      kernel.upsertHostPrefixDnsRecord("alpha.proxy.example", {
        env: { HOST: "proxy.example" },
        kv,
        config: { cfZoneId: "zone-id", cfApiToken: "api-token" },
        cnameTarget: "target.example"
      }),
      error => error?.message === "second_delete_failed"
        && error?.details?.rollbackAttempted === true
        && error?.details?.rollbackSucceeded === true
    );
  });

  assert.deepEqual(getComparableDnsRecords(dns.records), getComparableDnsRecords(new Map(initialRecords.map(record => [record.id, record]))));
});

test("CNAME sync restores DNS when strict history persistence fails", async () => {
  const initialRecords = [
    { id: "cname-1", name: "alpha.proxy.example", type: "CNAME", content: "old.target.example", ttl: 60, proxied: false }
  ];
  const dns = createCloudflareDnsFetch(initialRecords);
  const historyKey = kernel.getDnsRecordHistoryKey("zone-id", kernel.getDnsHostHistoryRecordId("alpha.proxy.example"));
  const { kv } = createInMemoryKvStore({
    [historyKey]: [{ type: "CNAME", content: "old.target.example" }]
  });
  const originalPut = kv.put;
  kv.put = async (key, value) => {
    if (key === historyKey) throw new Error("history_write_failed");
    return await originalPut(key, value);
  };

  await withWorkerGlobals({ fetch: dns.fetch }, async () => {
    await assert.rejects(
      kernel.upsertHostPrefixDnsRecord("alpha.proxy.example", {
        env: { HOST: "proxy.example" },
        kv,
        config: { cfZoneId: "zone-id", cfApiToken: "api-token" },
        cnameTarget: "new.target.example"
      }),
      error => error?.message === "history_write_failed"
        && error?.details?.rollbackAttempted === true
        && error?.details?.rollbackSucceeded === true
    );
  });

  assert.deepEqual(getComparableDnsRecords(dns.records), getComparableDnsRecords(new Map(initialRecords.map(record => [record.id, record]))));
});

test("CNAME history mutation fails closed when the existing history cannot be read", async () => {
  const initialRecords = [
    { id: "cname-1", name: "alpha.proxy.example", type: "CNAME", content: "old.target.example", ttl: 60, proxied: false }
  ];
  const dns = createCloudflareDnsFetch(initialRecords);
  const historyKey = kernel.getDnsRecordHistoryKey("zone-id", kernel.getDnsHostHistoryRecordId("alpha.proxy.example"));
  const { kv, putKeys } = createInMemoryKvStore();
  const originalGet = kv.get;
  kv.get = async (key, options) => {
    if (key === historyKey) throw new Error("history_read_failed");
    return await originalGet(key, options);
  };

  await withWorkerGlobals({ fetch: dns.fetch }, async () => {
    await assert.rejects(
      kernel.upsertHostPrefixDnsRecord("alpha.proxy.example", {
        env: { HOST: "proxy.example" },
        kv,
        config: { cfZoneId: "zone-id", cfApiToken: "api-token" },
        cnameTarget: "new.target.example"
      }),
      error => error?.message === "history_read_failed"
        && error?.details?.rollbackSucceeded === true
    );
  });

  assert.equal(putKeys.includes(historyKey), false);
  assert.deepEqual(getComparableDnsRecords(dns.records), getComparableDnsRecords(new Map(initialRecords.map(record => [record.id, record]))));
});

test("single-record DNS update restores the previous record when history persistence fails", async () => {
  const initialRecords = [
    { id: "cname-1", name: "alpha.proxy.example", type: "CNAME", content: "old.target.example", ttl: 60, proxied: false }
  ];
  const dns = createCloudflareDnsFetch(initialRecords);
  const historyKey = kernel.getDnsRecordHistoryKey("zone-id", kernel.getDnsHostHistoryRecordId("alpha.proxy.example"));
  const { kv } = createInMemoryKvStore({
    [kernel.CONFIG_KEY]: { cfZoneId: "zone-id", cfApiToken: "api-token" },
    [historyKey]: [{ type: "CNAME", content: "old.target.example" }]
  });
  const originalPut = kv.put;
  kv.put = async (key, value) => {
    if (key === historyKey) throw new Error("history_write_failed");
    return await originalPut(key, value);
  };
  const env = { ENI_KV: kv, __CONFIG_CACHE_NAMESPACE: "single-dns-update-history-rollback" };
  invalidateRuntimeConfigCache();

  try {
    const response = await withWorkerGlobals({ fetch: dns.fetch }, () => adminActions.updateDnsRecord({
      recordId: "cname-1",
      host: "alpha.proxy.example",
      type: "CNAME",
      content: "new.target.example"
    }, {
      env,
      kv,
      request: new Request("https://proxy.example/admin", {
        headers: { "X-Admin-Confirm": "updateDnsRecord" }
      })
    }));
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "CF_DNS_UPDATE_FAILED");
    assert.equal(payload.error.details.reason, "history_write_failed");
    assert.equal(payload.error.details.rollbackAttempted, true);
    assert.equal(payload.error.details.rollbackSucceeded, true);
    assert.equal(payload.error.details.rollbackError, "");
    assert.deepEqual(getComparableDnsRecords(dns.records), getComparableDnsRecords(new Map(initialRecords.map(record => [record.id, record]))));
  } finally {
    invalidateRuntimeConfigCache();
  }
});

test("single-record DNS update reports a failed history compensation", async () => {
  const initialRecords = [
    { id: "cname-1", name: "alpha.proxy.example", type: "CNAME", content: "old.target.example", ttl: 60, proxied: false }
  ];
  const dns = createCloudflareDnsFetch(initialRecords, {
    failMutationAt: 2,
    failureMessage: "dns_rollback_failed"
  });
  const historyKey = kernel.getDnsRecordHistoryKey("zone-id", kernel.getDnsHostHistoryRecordId("alpha.proxy.example"));
  const { kv } = createInMemoryKvStore({
    [kernel.CONFIG_KEY]: { cfZoneId: "zone-id", cfApiToken: "api-token" },
    [historyKey]: [{ type: "CNAME", content: "old.target.example" }]
  });
  const originalPut = kv.put;
  kv.put = async (key, value) => {
    if (key === historyKey) throw new Error("history_write_failed");
    return await originalPut(key, value);
  };
  const env = { ENI_KV: kv, __CONFIG_CACHE_NAMESPACE: "single-dns-update-history-rollback-failure" };
  invalidateRuntimeConfigCache();

  try {
    const response = await withWorkerGlobals({ fetch: dns.fetch }, () => adminActions.updateDnsRecord({
      recordId: "cname-1",
      host: "alpha.proxy.example",
      type: "CNAME",
      content: "new.target.example"
    }, {
      env,
      kv,
      request: new Request("https://proxy.example/admin", {
        headers: { "X-Admin-Confirm": "updateDnsRecord" }
      })
    }));
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error.details.reason, "history_write_failed");
    assert.equal(payload.error.details.rollbackAttempted, true);
    assert.equal(payload.error.details.rollbackSucceeded, false);
    assert.equal(payload.error.details.rollbackError, "dns_rollback_failed");
    assert.equal(dns.records.get("cname-1").content, "new.target.example");
  } finally {
    invalidateRuntimeConfigCache();
  }
});

test("single-record DNS create deletes the new record when history persistence fails", async () => {
  const dns = createCloudflareDnsFetch([]);
  const historyKey = kernel.getDnsRecordHistoryKey("zone-id", kernel.getDnsHostHistoryRecordId("alpha.proxy.example"));
  const { kv } = createInMemoryKvStore({
    [kernel.CONFIG_KEY]: { cfZoneId: "zone-id", cfApiToken: "api-token" }
  });
  const originalPut = kv.put;
  kv.put = async (key, value) => {
    if (key === historyKey) throw new Error("history_write_failed");
    return await originalPut(key, value);
  };
  const env = { ENI_KV: kv, __CONFIG_CACHE_NAMESPACE: "single-dns-create-history-rollback" };
  invalidateRuntimeConfigCache();

  try {
    const response = await withWorkerGlobals({ fetch: dns.fetch }, () => adminActions.updateDnsRecord({
      host: "alpha.proxy.example",
      type: "CNAME",
      content: "new.target.example"
    }, {
      env,
      kv,
      request: new Request("https://proxy.example/admin", {
        headers: { "X-Admin-Confirm": "createDnsRecord" }
      })
    }));
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error.details.rollbackAttempted, true);
    assert.equal(payload.error.details.rollbackSucceeded, true);
    assert.equal(dns.records.size, 0);
  } finally {
    invalidateRuntimeConfigCache();
  }
});

test("node rollback restores KV even when DNS compensation fails", async () => {
  const { kv, storedValues } = createInMemoryKvStore({
    [`${kernel.PREFIX}alpha`]: { target: "https://new-origin.test", entryMode: "host_prefix" }
  });
  const mutation = {
    previousName: "alpha",
    previousNode: { target: "https://old-origin.test", entryMode: "host_prefix" },
    nextName: "alpha",
    nextNode: { target: "https://new-origin.test", entryMode: "host_prefix" },
    nodeChanged: true,
    dnsPlan: { changed: true, rollbackSteps: [{ type: "upsert", host: "alpha.proxy.example", cnameTarget: "old.target.example" }] }
  };
  const originalPersistHostPrefixDnsSyncPlan = kernel.persistHostPrefixDnsSyncPlan;
  kernel.persistHostPrefixDnsSyncPlan = async () => {
    throw new Error("dns_rollback_failed");
  };
  try {
    await assert.rejects(
      kernel.rollbackPreparedNodeMutations([mutation], {
        kv,
        config: { cfZoneId: "zone-id", cfApiToken: "api-token" }
      }),
      /dns:dns_rollback_failed/
    );
  } finally {
    kernel.persistHostPrefixDnsSyncPlan = originalPersistHostPrefixDnsSyncPlan;
  }

  assert.equal(JSON.parse(storedValues.get(`${kernel.PREFIX}alpha`)).target, "https://old-origin.test");
});

test("active rename mutation rolls back a partial KV write", async () => {
  const previousNode = { target: "https://old-origin.test", entryMode: "kv_route" };
  const nextNode = { target: "https://new-origin.test", entryMode: "kv_route" };
  const { kv, storedValues } = createInMemoryKvStore({
    [`${kernel.PREFIX}alpha`]: previousNode
  });
  const originalDelete = kv.delete;
  let deleteFailurePending = true;
  kv.delete = async key => {
    if (key === `${kernel.PREFIX}alpha` && deleteFailurePending) {
      deleteFailurePending = false;
      throw new Error("rename_delete_failed");
    }
    return await originalDelete(key);
  };

  await assert.rejects(
    kernel.applyPreparedNodeMutations([{
      previousName: "alpha",
      previousNode,
      nextName: "beta",
      nextNode,
      nodeChanged: true,
      dnsPlan: null
    }], { kv }),
    error => error?.message === "rename_delete_failed"
      && error?.details?.rollbackAttempted === true
      && error?.details?.rollbackSucceeded === true
  );

  assert.deepEqual(JSON.parse(storedValues.get(`${kernel.PREFIX}alpha`)), previousNode);
  assert.equal(storedValues.has(`${kernel.PREFIX}beta`), false);
});

test("full import restores inherited host-prefix DNS after a node index rebuild failure", async () => {
  const previousConfig = {
    cfZoneId: "zone-id",
    cfApiToken: "api-token",
    defaultHostPrefixCnameTarget: "old.target.example"
  };
  const previousNode = {
    target: "https://old-origin.test",
    entryMode: "host_prefix"
  };
  const { kv, storedValues } = createInMemoryKvStore({
    [kernel.CONFIG_KEY]: previousConfig,
    [`${kernel.PREFIX}alpha`]: previousNode
  });
  const dns = createCloudflareDnsFetch([{
    id: "cname-1",
    name: "alpha.proxy.example",
    type: "CNAME",
    content: "old.target.example",
    ttl: 1,
    proxied: false
  }]);
  const env = {
    ENI_KV: kv,
    HOST: "proxy.example",
    __CONFIG_CACHE_NAMESPACE: "full-import-node-rebuild-rollback"
  };
  const originalRebuildNodeIndexesFromKv = kernel.rebuildNodeIndexesFromKv;
  let rebuildCount = 0;
  kernel.rebuildNodeIndexesFromKv = async (...args) => {
    rebuildCount += 1;
    if (rebuildCount === 1) throw new Error("node_index_rebuild_failed");
    return await originalRebuildNodeIndexesFromKv.apply(kernel, args);
  };
  invalidateRuntimeConfigCache();

  try {
    await withWorkerGlobals({ fetch: dns.fetch }, async () => {
      await assert.rejects(
        adminActions.importFull({
          config: {
            ...previousConfig,
            defaultHostPrefixCnameTarget: "new.target.example"
          },
          nodes: [{
            name: "alpha",
            target: "https://new-origin.test",
            entryMode: "kv_route"
          }]
        }, { env, ctx: null, kv }),
        error => error?.message === "node_index_rebuild_failed"
          && error?.details?.nodeRollbackError === ""
          && error?.details?.configRollbackError === ""
      );
    });

    const restoredConfig = JSON.parse(storedValues.get(kernel.CONFIG_KEY));
    const restoredNode = JSON.parse(storedValues.get(`${kernel.PREFIX}alpha`));
    assert.equal(restoredConfig.defaultHostPrefixCnameTarget, "old.target.example");
    assert.equal(restoredNode.entryMode, "host_prefix");
    assert.equal(restoredNode.target, "https://old-origin.test:443");
    assert.deepEqual(getComparableDnsRecords(dns.records), [{
      name: "alpha.proxy.example",
      type: "CNAME",
      content: "old.target.example",
      ttl: 1,
      proxied: false
    }]);
  } finally {
    kernel.rebuildNodeIndexesFromKv = originalRebuildNodeIndexesFromKv;
    invalidateRuntimeConfigCache();
  }
});

test("node revision refresh coalesces and hot node reads stay in memory", async () => {
  isolateState.SingleFlightTasks.clear();
  isolateState.NodeCache.clear();
  invalidateNodesRevisionCache();
  const revisionGate = createDeferred();
  const revisionReadStarted = createDeferred();
  let revisionReadCount = 0;
  const kv = {
    async get(key) {
      assert.equal(key, kernel.NODES_INDEX_META_KEY);
      revisionReadCount += 1;
      revisionReadStarted.resolve();
      await revisionGate.promise;
      return { revision: "nodes-r1" };
    }
  };

  const firstRevision = kernel.getNodesRevision(kv);
  const secondRevision = kernel.getNodesRevision(kv);
  await revisionReadStarted.promise;
  assert.equal(revisionReadCount, 1);
  revisionGate.resolve();
  assert.deepEqual(await Promise.all([firstRevision, secondRevision]), ["nodes-r1", "nodes-r1"]);

  isolateState.NodeCache.set("alpha", {
    data: { target: "https://origin.test" },
    exp: Date.now() + 60000,
    nodesRevision: "nodes-r1"
  });
  const cachedNode = await kernel.getNode("alpha", { ENI_KV: kv }, null);
  assert.equal(cachedNode.target, "https://origin.test");
  assert.equal(revisionReadCount, 1);
  isolateState.NodeCache.clear();
  invalidateNodesRevisionCache();
});

test("node revision read failures are retried instead of negative-cached", async () => {
  isolateState.SingleFlightTasks.clear();
  invalidateNodesRevisionCache();
  let revisionReadCount = 0;
  const kv = {
    async get(key) {
      assert.equal(key, kernel.NODES_INDEX_META_KEY);
      revisionReadCount += 1;
      if (revisionReadCount === 1) throw new Error("transient revision failure");
      return { revision: "nodes-r2" };
    }
  };

  assert.equal(await kernel.getNodesRevision(kv), "");
  assert.equal(isolateState.NodesRevisionCache, null);
  assert.equal(await kernel.getNodesRevision(kv), "nodes-r2");
  assert.equal(revisionReadCount, 2);
  invalidateNodesRevisionCache();
});

test("node writes prevent older positive and negative reads from refilling memory", async () => {
  for (const [nodeName, storedNode] of [
    ["stale-positive", { target: "https://old-origin.test" }],
    ["stale-negative", null]
  ]) {
    isolateState.NodeCache.clear();
    invalidateNodesRevisionCache();
    const entityReadStarted = createDeferred();
    const entityReadGate = createDeferred();
    const kv = {
      async get(key) {
        if (key === `${kernel.PREFIX}${nodeName}`) {
          entityReadStarted.resolve();
          await entityReadGate.promise;
          return storedNode;
        }
        throw new Error(`unexpected KV read: ${key}`);
      }
    };

    const staleRead = kernel.getNode(nodeName, { ENI_KV: kv }, null);
    await entityReadStarted.promise;
    kernel.invalidateNodeCaches(nodeName, { invalidateList: true });
    entityReadGate.resolve();

    assert.equal(await staleRead, null);
    assert.equal(isolateState.NodeCache.has(nodeName), false);
  }
  invalidateNodesRevisionCache();
});

test("evicted node generations cannot revive an older cold read", async () => {
  isolateState.SingleFlightTasks.clear();
  isolateState.NodeCache.clear();
  isolateState.NodeCacheGenerations.clear();
  const entityReadStarted = createDeferred();
  const entityReadGate = createDeferred();
  const kv = {
    async get(key) {
      if (key === `${kernel.PREFIX}alpha`) {
        entityReadStarted.resolve();
        await entityReadGate.promise;
        return { target: "https://stale-origin.test" };
      }
      if (key === kernel.NODES_INDEX_META_KEY) return { revision: "nodes-r1" };
      throw new Error(`unexpected KV read: ${key}`);
    }
  };
  const database = { ...kernel };
  database.upsertNodeSummaryEntry = async () => null;

  const staleRead = database.getNode("alpha", { ENI_KV: kv }, null);
  await entityReadStarted.promise;
  database.invalidateNodeCaches([
    "alpha",
    ...Array.from({ length: 5000 }, (_, index) => `generation-churn-${index}`)
  ]);
  assert.equal(isolateState.NodeCacheGenerations.has("alpha"), false);
  entityReadGate.resolve();

  assert.equal(await staleRead, null);
  assert.equal(isolateState.NodeCache.has("alpha"), false);
  isolateState.SingleFlightTasks.clear();
  isolateState.NodeCache.clear();
  isolateState.NodeCacheGenerations.clear();
});

test("unrelated node invalidation does not cancel another node's cold read", async () => {
  isolateState.SingleFlightTasks.clear();
  isolateState.NodeCache.clear();
  isolateState.NodeCacheGenerations.clear();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
  const entityReadStarted = createDeferred();
  const entityReadGate = createDeferred();
  const kv = {
    async get(key) {
      if (key === `${kernel.PREFIX}alpha`) {
        entityReadStarted.resolve();
        await entityReadGate.promise;
        return { target: "https://origin.test" };
      }
      if (key === kernel.NODES_INDEX_META_KEY) return { revision: "nodes-r1" };
      throw new Error(`unexpected KV read: ${key}`);
    },
    async put() {}
  };
  const nodeOperations = { ...kernel };
  Object.assign(nodeOperations, defineNodeRepositoryMethods({}, nodeOperations));
  nodeOperations.upsertNodeSummaryEntry = async () => null;

  const alphaRead = nodeOperations.getNode("alpha", { ENI_KV: kv }, null);
  await entityReadStarted.promise;
  nodeOperations.invalidateNodeCaches("beta", { invalidateList: true });
  entityReadGate.resolve();

  const alphaNode = await alphaRead;
  assert.equal(new URL(alphaNode.target).hostname, "origin.test");
  assert.equal(isolateState.NodeCache.get("alpha")?.data, alphaNode);
  isolateState.NodeCache.clear();
  isolateState.NodeCacheGenerations.clear();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
});

test("stale node-summary reads cannot refill invalidated list caches", async () => {
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
  const summaryReadStarted = createDeferred();
  const summaryReadGate = createDeferred();
  const alphaSummary = kernel.buildNodeSummary("alpha", { target: "https://origin.test" }).summary;
  assert.ok(alphaSummary);
  const kv = {
    async get(key) {
      assert.equal(key, kernel.NODES_SUMMARY_INDEX_KEY);
      summaryReadStarted.resolve();
      await summaryReadGate.promise;
      return [alphaSummary];
    }
  };

  const staleRead = kernel.getNodesSummaryIndex(kv, { useCache: false });
  await summaryReadStarted.promise;
  invalidateNodesRevisionCache();
  summaryReadGate.resolve();

  const summaries = await staleRead;
  assert.deepEqual(summaries.map(node => node.name), ["alpha"]);
  assert.equal(isolateState.NodesListCache, null);
  assert.equal(isolateState.NodesIndexCache, null);
  invalidateNodesRevisionCache();
});

test("node-index mutations serialize so final KV and memory revisions match", async () => {
  isolateState.NodeIndexMutationChain = Promise.resolve();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
  const oldWriteStarted = createDeferred();
  const oldWriteGate = createDeferred();
  const storedValues = new Map();
  const putKeys = [];
  let putCount = 0;
  const kv = {
    async put(key, value) {
      putCount += 1;
      putKeys.push(key);
      if (putCount === 1) {
        oldWriteStarted.resolve();
        await oldWriteGate.promise;
      }
      storedValues.set(key, value);
    }
  };
  const database = { ...kernel };
  database.readRevisionMeta = async () => ({
    revision: "nodes-base",
    updatedAt: "2026-07-01T00:00:00.000Z",
    hash: "",
    count: 0,
    indexHash: "",
    fullIndexHash: ""
  });

  const oldMutation = database.persistNodesIndex(["old"], { kv });
  await oldWriteStarted.promise;
  const freshMutation = database.persistNodesIndex(["fresh"], { kv });
  assert.equal(putCount, 1);

  oldWriteGate.resolve();
  await Promise.all([oldMutation, freshMutation]);

  assert.deepEqual(putKeys, [
    kernel.NODES_INDEX_KEY,
    kernel.NODES_INDEX_META_KEY,
    kernel.NODES_INDEX_KEY,
    kernel.NODES_INDEX_META_KEY
  ]);
  assert.deepEqual(JSON.parse(storedValues.get(kernel.NODES_INDEX_KEY)), ["fresh"]);
  const storedMeta = JSON.parse(storedValues.get(kernel.NODES_INDEX_META_KEY));
  assert.equal(isolateState.NodesRevisionCache?.revision, storedMeta.revision);
  assert.deepEqual(isolateState.NodesIndexCache?.data, ["fresh"]);
  isolateState.NodeIndexMutationChain = Promise.resolve();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
});

test("concurrent node-summary upserts merge inside the mutation chain", async () => {
  isolateState.NodeIndexMutationChain = Promise.resolve();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
  const storedValues = new Map([
    [kernel.NODES_SUMMARY_INDEX_KEY, JSON.stringify([])],
    [kernel.NODES_INDEX_META_KEY, JSON.stringify(kernel.buildNodesIndexMeta([], [], {
      updatedAt: "2026-07-01T00:00:00.000Z"
    }))]
  ]);
  const kv = {
    async get(key, options = {}) {
      const stored = storedValues.get(key);
      if (options.type === "json" && typeof stored === "string") return JSON.parse(stored);
      return stored ?? null;
    },
    async put(key, value) {
      storedValues.set(key, value);
    }
  };

  const [alpha, beta] = await Promise.all([
    kernel.upsertNodeSummaryEntry("alpha", { target: "https://alpha-origin.test" }, { kv }),
    kernel.upsertNodeSummaryEntry("beta", { target: "https://beta-origin.test" }, { kv })
  ]);

  assert.deepEqual([alpha.name, beta.name], ["alpha", "beta"]);
  const storedNames = JSON.parse(storedValues.get(kernel.NODES_SUMMARY_INDEX_KEY)).map(node => node.name);
  assert.deepEqual(storedNames, ["alpha", "beta"]);
  assert.deepEqual(isolateState.NodesListCache?.data.map(node => node.name), ["alpha", "beta"]);
  isolateState.NodeIndexMutationChain = Promise.resolve();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
});

test("node-index rebuilds serialize entity loading with their commit", async () => {
  isolateState.NodeIndexMutationChain = Promise.resolve();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
  const firstListStarted = createDeferred();
  const firstListGate = createDeferred();
  const storedValues = new Map([
    [`${kernel.PREFIX}alpha`, JSON.stringify({ target: "https://alpha-origin.test" })],
    [kernel.NODES_SUMMARY_INDEX_KEY, JSON.stringify([])],
    [kernel.NODES_INDEX_META_KEY, JSON.stringify(kernel.buildNodesIndexMeta([], [], {
      updatedAt: "2026-07-01T00:00:00.000Z"
    }))]
  ]);
  let listCount = 0;
  const kv = {
    async get(key, options = {}) {
      const stored = storedValues.get(key);
      if (options.type === "json" && typeof stored === "string") return JSON.parse(stored);
      return stored ?? null;
    },
    async put(key, value) {
      storedValues.set(key, value);
    },
    async list({ prefix }) {
      listCount += 1;
      const keys = [...storedValues.keys()]
        .filter(key => key.startsWith(prefix))
        .map(name => ({ name }));
      if (listCount === 1) {
        firstListStarted.resolve();
        await firstListGate.promise;
      }
      return { keys, list_complete: true };
    }
  };

  const olderRebuild = kernel.rebuildNodeIndexesFromKv(kv);
  await firstListStarted.promise;
  storedValues.set(`${kernel.PREFIX}beta`, JSON.stringify({ target: "https://beta-origin.test" }));
  const fresherRebuild = kernel.rebuildNodeIndexesFromKv(kv);
  assert.equal(listCount, 1);
  firstListGate.resolve();

  const [olderState, fresherState] = await Promise.all([olderRebuild, fresherRebuild]);
  assert.deepEqual(olderState.index, ["alpha"]);
  assert.deepEqual(fresherState.index, ["alpha", "beta"]);
  const storedNames = JSON.parse(storedValues.get(kernel.NODES_SUMMARY_INDEX_KEY)).map(node => node.name);
  assert.deepEqual(storedNames, ["alpha", "beta"]);
  isolateState.NodeIndexMutationChain = Promise.resolve();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
});

test("node-index writes reject incomplete entity truth-source reads", async () => {
  const runRejectedWrite = async (operation) => {
    isolateState.NodeIndexMutationChain = Promise.resolve();
    isolateState.NodesListCache = null;
    isolateState.NodesIndexCache = null;
    invalidateNodesRevisionCache();
    const writes = [];
    const kv = {
      async get(key) {
        if (key === kernel.NODES_SUMMARY_INDEX_KEY) return null;
        if (key === `${kernel.PREFIX}alpha`) return { target: "https://alpha-origin.test" };
        if (key === `${kernel.PREFIX}beta`) throw new Error("temporary kv read failure");
        return null;
      },
      async put(key, value) {
        writes.push([key, value]);
      },
      async list() {
        return {
          keys: [
            { name: `${kernel.PREFIX}alpha` },
            { name: `${kernel.PREFIX}beta` }
          ],
          list_complete: true
        };
      }
    };

    await assert.rejects(operation(kv), error => error?.code === "KV_READ_FAILED");
    assert.deepEqual(writes, []);
  };

  await runRejectedWrite(kv => kernel.rebuildNodeIndexesFromKv(kv));
  await runRejectedWrite(kv => kernel.upsertNodeSummaryEntry("gamma", {
    target: "https://gamma-origin.test"
  }, { kv }));
  isolateState.NodeIndexMutationChain = Promise.resolve();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
});

test("stale revision candidates cannot overwrite current node-index metadata", async () => {
  isolateState.NodeIndexMutationChain = Promise.resolve();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
  const storedValues = new Map();
  const kv = {
    async get(key, options = {}) {
      const stored = storedValues.get(key);
      if (options.type === "json" && typeof stored === "string") return JSON.parse(stored);
      return stored ?? null;
    },
    async put(key, value) {
      storedValues.set(key, value);
    }
  };
  const freshSummary = kernel.buildNodeSummary("fresh", { target: "https://fresh-origin.test" }).summary;
  const staleSummary = kernel.buildNodeSummary("stale", { target: "https://stale-origin.test" }).summary;
  await kernel.persistNodesSummaryIndex([freshSummary], { kv });
  const freshMeta = JSON.parse(storedValues.get(kernel.NODES_INDEX_META_KEY));

  const ensuredMeta = await kernel.ensureNodesIndexMeta(kv, {
    index: ["stale"],
    nodes: [staleSummary]
  });

  const storedMeta = JSON.parse(storedValues.get(kernel.NODES_INDEX_META_KEY));
  assert.equal(ensuredMeta.revision, freshMeta.revision);
  assert.equal(storedMeta.revision, freshMeta.revision);
  assert.equal(isolateState.NodesRevisionCache?.revision, freshMeta.revision);
  isolateState.NodeIndexMutationChain = Promise.resolve();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
});

test("concurrent proxy cold reads share one node entity load", async () => {
  isolateState.SingleFlightTasks.clear();
  isolateState.NodeCache.clear();
  isolateState.NodeCacheGenerations.clear();
  invalidateNodesRevisionCache();
  const entityReadStarted = createDeferred();
  const entityReadGate = createDeferred();
  let entityReadCount = 0;
  const kv = {
    async get(key) {
      if (key === `${kernel.PREFIX}alpha`) {
        entityReadCount += 1;
        entityReadStarted.resolve();
        await entityReadGate.promise;
        return { target: "https://origin.test" };
      }
      if (key === kernel.NODES_INDEX_META_KEY) return { revision: "nodes-r1" };
      throw new Error(`unexpected KV read: ${key}`);
    },
    async put() {}
  };
  const nodeOperations = { ...kernel };
  Object.assign(nodeOperations, defineNodeRepositoryMethods({}, nodeOperations));
  nodeOperations.upsertNodeSummaryEntry = async () => null;

  const coldReads = Array.from({ length: 10 }, () => nodeOperations.getNode("alpha", { ENI_KV: kv }, null));
  await entityReadStarted.promise;
  assert.equal(entityReadCount, 1);
  entityReadGate.resolve();

  const nodes = await Promise.all(coldReads);
  assert.equal(nodes.every(node => new URL(node.target).hostname === "origin.test"), true);
  assert.equal(entityReadCount, 1);
  isolateState.SingleFlightTasks.clear();
  isolateState.NodeCache.clear();
  isolateState.NodeCacheGenerations.clear();
  invalidateNodesRevisionCache();
});

test("node entity and summary caches are isolated by KV binding", async () => {
  const createKv = (nodeName, target) => {
    const summary = kernel.buildNodeSummary(nodeName, { target }).summary;
    let entityReads = 0;
    let summaryReads = 0;
    return {
      kv: {
        async get(key) {
          if (key === `${kernel.PREFIX}${nodeName}`) {
            entityReads += 1;
            return { target };
          }
          if (key === kernel.NODES_SUMMARY_INDEX_KEY) {
            summaryReads += 1;
            return [summary];
          }
          if (key === kernel.NODES_INDEX_META_KEY) return { revision: `${nodeName}-revision` };
          return null;
        },
        async put() {}
      },
      reads: () => ({ entityReads, summaryReads })
    };
  };
  const first = createKv("alpha", "https://first-origin.test");
  const second = createKv("alpha", "https://second-origin.test");
  const nodeOperations = { ...kernel };
  Object.assign(nodeOperations, defineNodeRepositoryMethods({}, nodeOperations));
  nodeOperations.upsertNodeSummaryEntry = async () => null;

  const firstNode = await nodeOperations.getNode("alpha", { ENI_KV: first.kv }, null);
  const secondNode = await nodeOperations.getNode("alpha", { ENI_KV: second.kv }, null);
  assert.equal(new URL(firstNode.target).hostname, "first-origin.test");
  assert.equal(new URL(secondNode.target).hostname, "second-origin.test");
  assert.equal(first.reads().entityReads, 1);
  assert.equal(second.reads().entityReads, 1);

  assert.deepEqual((await nodeOperations.getNodesSummaryIndex(first.kv)).map(node => node.name), ["alpha"]);
  assert.deepEqual((await nodeOperations.getNodesSummaryIndex(second.kv)).map(node => node.name), ["alpha"]);
  assert.equal(first.reads().summaryReads, 1);
  assert.equal(second.reads().summaryReads, 1);
  assert.notEqual(getNodeBindingCacheState(first.kv), getNodeBindingCacheState(second.kv));
});

test("node cache fallback state never reuses the latest KV binding", () => {
  const kv = {};
  const boundState = getNodeBindingCacheState(kv);
  const fallbackState = getNodeBindingCacheState();
  boundState.NodeCache.set("alpha", { data: { target: "https://origin.test" } });

  assert.notEqual(fallbackState, boundState);
  assert.equal(fallbackState.NodeCache.has("alpha"), false);
});

test("access-log queues remain isolated by D1 binding", () => {
  const firstDb = {};
  const secondDb = {};
  const context = { waitUntil() {} };
  const config = { logEnabled: true, logWriteMode: "all", logWriteDelayMinutes: 5 };
  const firstState = logBindingStates.get(firstDb);
  const secondState = logBindingStates.get(secondDb);
  firstState.LogQueue.length = 0;
  secondState.LogQueue.length = 0;

  testPlatform.fetch.logger.record({ DB: firstDb }, context, {
    runtimeConfig: config,
    nodeName: "first",
    requestPath: "/System/Info",
    requestMethod: "GET",
    statusCode: 500
  });
  testPlatform.fetch.logger.record({ DB: secondDb }, context, {
    runtimeConfig: config,
    nodeName: "second",
    requestPath: "/System/Ping",
    requestMethod: "GET",
    statusCode: 500
  });

  assert.equal(firstState.LogQueue.length, 1);
  assert.equal(secondState.LogQueue.length, 1);
  assert.equal(firstState.LogQueue[0].nodeName, "first");
  assert.equal(secondState.LogQueue[0].nodeName, "second");
});

test("log config fallback reads the matching KV binding cache", async () => {
  invalidateRuntimeConfigCache();
  const firstDb = {};
  const secondDb = {};
  const context = { waitUntil() {} };
  const firstEnv = { DB: firstDb, ENI_KV: { async get() { return { logEnabled: false }; } } };
  const secondEnv = { DB: secondDb, ENI_KV: { async get() { return { logEnabled: true, logWriteDelayMinutes: 5 }; } } };
  await getRuntimeConfig(firstEnv);
  await getRuntimeConfig(secondEnv);

  const firstState = logBindingStates.get(firstDb);
  const secondState = logBindingStates.get(secondDb);
  firstState.LogQueue.length = 0;
  secondState.LogQueue.length = 0;
  testPlatform.fetch.logger.record(firstEnv, context, {
    nodeName: "first",
    requestPath: "/System/Info",
    requestMethod: "GET",
    statusCode: 500
  });
  testPlatform.fetch.logger.record(secondEnv, context, {
    nodeName: "second",
    requestPath: "/System/Info",
    requestMethod: "GET",
    statusCode: 500
  });

  assert.equal(firstState.LogQueue.length, 0);
  assert.equal(secondState.LogQueue.length, 1);
  invalidateRuntimeConfigCache();
  logBindingStates.reset();
});

test("incremental cleanup removes expired playback route snapshots", () => {
  const kv = {};
  const state = getNodeBindingCacheState(kv);
  state.PlaybackRouteHotCache.set("stale", {
    nodeName: "stale",
    expiresAt: Date.now() - 1
  });
  isolateState.CleanupState.phase = 1;
  isolateState.CleanupState.lastRunAt = 0;

  cachePort.maybeCleanup({ ENI_KV: kv });

  assert.equal(state.PlaybackRouteHotCache.has("stale"), false);
});

test("incremental cleanup keeps schedules isolated by KV binding", () => {
  const firstKv = {};
  const secondKv = {};
  const firstState = getNodeBindingCacheState(firstKv);
  const secondState = getNodeBindingCacheState(secondKv);
  firstState.PlaybackRouteHotCache.set("first", { expiresAt: Date.now() - 1 });
  secondState.PlaybackRouteHotCache.set("second", { expiresAt: Date.now() - 1 });
  for (const state of [firstState, secondState]) {
    state.CleanupState.phase = 1;
    state.CleanupState.lastRunAt = 0;
  }

  cachePort.maybeCleanup({ ENI_KV: firstKv });
  cachePort.maybeCleanup({ ENI_KV: secondKv });

  assert.equal(firstState.PlaybackRouteHotCache.has("first"), false);
  assert.equal(secondState.PlaybackRouteHotCache.has("second"), false);
});

test("proxy node misses use the short-lived node cache", async () => {
  isolateState.SingleFlightTasks.clear();
  isolateState.NodeCache.clear();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
  let nodeReadCount = 0;
  const kv = {
    async get(key) {
      if (key === `${kernel.PREFIX}missing`) {
        nodeReadCount += 1;
        return null;
      }
      if (key === kernel.NODES_SUMMARY_INDEX_KEY) return [];
      if (key === kernel.NODES_INDEX_META_KEY) return { revision: "nodes-r1" };
      throw new Error(`unexpected KV read: ${key}`);
    }
  };
  const env = { ENI_KV: kv };

  assert.equal(await kernel.getNode("missing", env, null), null);
  assert.equal(await kernel.getNode("missing", env, null), null);
  assert.equal(nodeReadCount, 1);
  assert.equal(isolateState.NodeCache.get("missing")?.data, null);
  isolateState.NodeCache.get("missing").exp = Date.now() - 1;
  assert.equal(await kernel.getNode("missing", env, null), null);
  assert.equal(nodeReadCount, 2);
  isolateState.NodeCache.clear();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
});

test("strict admin node reads bypass the proxy negative cache", async () => {
  isolateState.SingleFlightTasks.clear();
  isolateState.NodeCache.clear();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
  let nodeExists = false;
  let nodeReadCount = 0;
  const kv = {
    async get(key) {
      if (key === `${kernel.PREFIX}alpha`) {
        nodeReadCount += 1;
        return nodeExists ? { target: "https://origin.test" } : null;
      }
      if (key === kernel.NODES_SUMMARY_INDEX_KEY) return [];
      if (key === kernel.NODES_INDEX_META_KEY) return { revision: "nodes-r1" };
      throw new Error(`unexpected KV read: ${key}`);
    }
  };
  const env = { ENI_KV: kv };

  assert.equal(await kernel.getNode("alpha", env, null), null);
  assert.equal(nodeReadCount, 1);
  assert.equal(isolateState.NodeCache.get("alpha")?.data, null);

  nodeExists = true;
  const node = await kernel.getNodeForRead("alpha", env);
  assert.equal(new URL(node.target).hostname, "origin.test");
  assert.equal(nodeReadCount, 2);

  isolateState.NodeCache.clear();
  isolateState.NodesListCache = null;
  isolateState.NodesIndexCache = null;
  invalidateNodesRevisionCache();
});

test("proxy preparation reuses the runtime config loaded by the entry route", async () => {
  let configReadCount = 0;
  const runtimeConfig = { rateLimitRpm: 0 };
  const execution = await proxyService.prepareExecutionContext(
    new Request("https://worker.test/alpha/Items"),
    { target: "https://origin.test" },
    "/Items",
    "alpha",
    "",
    { ENI_KV: { async get() { configReadCount += 1; return {}; } } },
    { waitUntil() {} },
    { runtimeConfig }
  );

  assert.equal(execution.currentConfig, runtimeConfig);
  assert.equal(configReadCount, 0);
});

test("proxy preparation clones request URLs only when playback parameters mutate", async () => {
  const runtimeConfig = { rateLimitRpm: 0 };
  const node = { target: "https://origin.test" };
  const ctx = { waitUntil() {} };

  const plainUrl = new URL("https://worker.test/alpha/Items?api_key=test");
  const plainExecution = await proxyService.prepareExecutionContext(
    new Request(plainUrl),
    node,
    "/Items",
    "alpha",
    "",
    {},
    ctx,
    { requestUrl: plainUrl, runtimeConfig }
  );
  assert.equal(plainExecution.requestMethod, "GET");
  assert.equal(plainExecution.requestUrl, plainUrl);
  assert.equal(plainUrl.searchParams.get("api_key"), "test");

  const fallbackUrl = new URL("https://worker.test/alpha/Videos/1/stream?__pb_abs=1&api_key=test");
  const fallbackExecution = await proxyService.prepareExecutionContext(
    new Request(fallbackUrl),
    node,
    "/Videos/1/stream",
    "alpha",
    "",
    {},
    ctx,
    { requestUrl: fallbackUrl, runtimeConfig }
  );
  assert.notEqual(fallbackExecution.requestUrl, fallbackUrl);
  assert.equal(fallbackExecution.requestUrl.searchParams.has("__pb_abs"), false);
  assert.equal(fallbackUrl.searchParams.get("__pb_abs"), "1");

  const relayTarget = Buffer.from("https://origin.test/Videos/1/stream", "utf8").toString("base64url");
  const relayUrl = new URL(`https://worker.test/alpha/__playback-relay/Videos/1/stream?__pb_target=${relayTarget}&api_key=test`);
  const relayExecution = await proxyService.prepareExecutionContext(
    new Request(relayUrl),
    node,
    "/__playback-relay/Videos/1/stream",
    "alpha",
    "",
    {},
    ctx,
    { requestUrl: relayUrl, runtimeConfig }
  );
  assert.notEqual(relayExecution.requestUrl, relayUrl);
  assert.equal(relayExecution.requestUrl.searchParams.has("__pb_target"), false);
  assert.equal(relayUrl.searchParams.get("__pb_target"), relayTarget);
});

test("proxy metadata preparation rekeys identity and cache TTL", async () => {
  const node = { target: "https://origin.test" };
  const ctx = { waitUntil() {} };
  const buildExecution = (token, cacheTtlImages) => proxyService.prepareExecutionContext(
    new Request(`https://worker.test/alpha/Items/1/Images/Primary?api_key=${encodeURIComponent(token)}&tag=v1`),
    node,
    "/Items/1/Images/Primary",
    "alpha",
    "node-key",
    {},
    ctx,
    { runtimeConfig: { rateLimitRpm: 0, cacheTtlImages } }
  );

  const [firstIdentity, secondIdentity, disabledCache] = await Promise.all([
    buildExecution("secret-a", 30),
    buildExecution("secret-b", 30),
    buildExecution("secret-a", 0)
  ]);

  assert.ok(firstIdentity.metadataCacheKey instanceof Request);
  assert.notEqual(firstIdentity.metadataCacheKey.url, secondIdentity.metadataCacheKey.url);
  assert.notEqual(firstIdentity.metadataCacheKey.url, disabledCache.metadataCacheKey.url);
  assert.doesNotMatch(firstIdentity.metadataCacheKey.url, /secret-a/);
  assert.notEqual(firstIdentity.metadataCacheIdentityPartition, secondIdentity.metadataCacheIdentityPartition);
  assert.notEqual(firstIdentity.metadataCachePolicyRevision, disabledCache.metadataCachePolicyRevision);
});

test("canonical OpsStatus read merges partition, root, shadow, and latest updatedAt", async () => {
  const db = { prepare() {} };
  const rootStatus = {
    updatedAt: "2026-07-01T00:00:00.000Z",
    log: {
      status: "root",
      rootOnly: true,
      nested: { fromRoot: true },
      updatedAt: "2026-07-02T00:00:00.000Z"
    }
  };
  const partitionStatus = {
    status: "partition",
    partitionOnly: true,
    nested: { fromPartition: true },
    updatedAt: "2026-07-03T00:00:00.000Z"
  };
  isolateState.OpsStatusShadowCache.set(db, {
    pendingPatch: {
      log: {
        status: "shadow",
        shadowOnly: true,
        nested: { fromShadow: true },
        updatedAt: "2026-07-04T00:00:00.000Z"
      }
    },
    flushPromise: null
  });

  const database = createStatusTestService(db);
  database.getOpsStatusSectionEntries = () => [["log", kernel.OPS_STATUS_SECTION_SCOPES.log]];
  database.getOpsStatusPayloadFromDb = async (_db, scope) => {
    if (scope === kernel.OPS_STATUS_DB_SCOPE_ROOT) return rootStatus;
    if (scope === kernel.OPS_STATUS_SECTION_SCOPES.log) return partitionStatus;
    return null;
  };

  const status = await database.getOpsStatus(db);
  assert.equal(status.log.status, "shadow");
  assert.equal(status.log.rootOnly, true);
  assert.equal(status.log.partitionOnly, true);
  assert.equal(status.log.shadowOnly, true);
  assert.deepEqual(status.log.nested, {
    fromPartition: true,
    fromRoot: true,
    fromShadow: true
  });
  assert.equal(status.log.updatedAt, "2026-07-04T00:00:00.000Z");
  assert.equal(status.updatedAt, "2026-07-04T00:00:00.000Z");
});

test("full OpsStatus reads the root and each section exactly once", async () => {
  const db = { prepare() {} };
  const readCounts = new Map();
  const database = createStatusTestService(db);
  database.getOpsStatusPayloadFromDb = async (_db, scope) => {
    readCounts.set(scope, (readCounts.get(scope) || 0) + 1);
    return {};
  };

  await database.getOpsStatus(db);
  assert.deepEqual(Object.fromEntries(readCounts), {
    [kernel.OPS_STATUS_DB_SCOPE_ROOT]: 1,
    [kernel.OPS_STATUS_SECTION_SCOPES.log]: 1,
    [kernel.OPS_STATUS_SECTION_SCOPES.scheduled]: 1,
    [kernel.OPS_STATUS_SECTION_SCOPES.dnsIpPool]: 1
  });
});

test("admin HTML MIME acceptance remains limited to document-capable responses", () => {
  assert.equal(isAcceptedAdminHtmlDocumentContentType("", false), true);
  assert.equal(isAcceptedAdminHtmlDocumentContentType("text/html; charset=utf-8", false), true);
  assert.equal(isAcceptedAdminHtmlDocumentContentType("application/xhtml+xml", false), true);
  assert.equal(isAcceptedAdminHtmlDocumentContentType("text/plain", true), true);
  assert.equal(isAcceptedAdminHtmlDocumentContentType("application/octet-stream", true), true);
  assert.equal(isAcceptedAdminHtmlDocumentContentType("text/plain", false), false);
  assert.equal(isAcceptedAdminHtmlDocumentContentType("application/octet-stream", false), false);
  assert.equal(isAcceptedAdminHtmlDocumentContentType("application/json", true), false);
});

test("fresh remote shell rejects a wrong MIME even when the body is HTML", async () => {
  const html = '<!doctype html><html><body><div id="app"></div></body></html>';
  await withWorkerGlobals({
    fetch: async () => new Response(html, {
      headers: { "Content-Type": "application/json" }
    })
  }, async () => {
    await assert.rejects(
      fetchAdminRemoteShellStoredResponse(
        "https://example.test/index.html",
        { adminPath: "/admin" },
        { ok: true, missing: [] }
      ),
      /content-type invalid/
    );
  });
});

test("fresh remote shell rejects an HTML document without the app root", async () => {
  let html = "";
  await withWorkerGlobals({
    fetch: async () => new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    })
  }, async () => {
    const invalidDocuments = [
      "<!doctype html><html><body><main>missing app root</main></body></html>",
      '<!doctype html><html><body><main data-id="app"></main></body></html>',
      '<!doctype html><html><body><script>const template = \'<div id="app"></div>\';</script></body></html>',
      '<!doctype html><html><body><!-- <div id="app"></div> --></body></html>',
      '<!doctype html><html><body><div title=" id=app "></div></body></html>',
      '<!doctype html><html><body><div title=" id=\'app\' "></div></body></html>',
      '<!doctype html><html><body><div id="App"></div></body></html>',
      '<!doctype html><html><body><template><div id="app"></div></template></body></html>'
    ];
    for (const invalidDocument of invalidDocuments) {
      html = invalidDocument;
      await assert.rejects(
        fetchAdminRemoteShellStoredResponse(
          "https://example.test/index.html",
          { adminPath: "/admin" },
          { ok: true, missing: [] }
        ),
        /missing #app root/
      );
    }
  });
});

test("fresh remote shell recognizes only an exact app id attribute", async () => {
  let html = "";
  await withWorkerGlobals({
    fetch: async () => new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    })
  }, async () => {
    const validDocuments = [
      '<!doctype html><html><body><div title=">"></div><main class="root" ID = \'app\'></main></body></html>',
      '<!doctype html><html><body><div title="<script>"></div><div id="app"></div></body></html>'
    ];
    for (const validDocument of validDocuments) {
      html = validDocument;
      const payload = await fetchAdminRemoteShellStoredResponse(
        "https://example.test/index.html",
        { adminPath: "/admin" },
        { ok: true, missing: [] }
      );
      assert.equal(payload.storedResponse.status, 200);
    }
  });
});

test("admin shell parsing rejects hidden markup and dynamic imports without recursive scanning", async () => {
  const hiddenAppRootDocuments = [
    '<!doctype html><html><body><!bogus <div id="app">></body></html>',
    '<!doctype html><html><body><![CDATA[<div id="app"></div>]]></body></html>'
  ];
  for (const html of hiddenAppRootDocuments) assert.equal(hasAdminRemoteShellAppRoot(html), false);

  const dynamicImportExpression = 'x++ / import("https://evil.test/runtime.js") / y;';
  assert.deepEqual(collectAdminInlineDynamicImports(dynamicImportExpression), [{
    index: dynamicImportExpression.indexOf("import"),
    reference: "import("
  }]);
  assert.deepEqual(collectAdminInlineDynamicImports("{".repeat(10000) + "}".repeat(10000)), []);
  assert.ok(getAdminRemoteShellAssetPolicyViolations(
    `<!doctype html><html><body><div id="app"></div><script>${dynamicImportExpression}</script></body></html>`,
    "https://example.test/index.html"
  ).some((violation) => violation.includes("inline")));
});

test("fresh remote shell keeps the external asset policy boundary", async () => {
  let assetUrl = "";
  await withWorkerGlobals({
    fetch: async () => new Response(
      `<!doctype html><html><body><div id="app"></div><script src="${assetUrl}"></script></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  }, async () => {
    const forbiddenAssetUrls = [
      "/assets/app.js",
      "https://esm.sh/vue@3/dist/vue.runtime.esm-browser.js",
      "https://raw.githubusercontent.com/owner/repo/main/app.js",
      "https://raw.githubusercontent.com./owner/repo/main/app.js",
      "https://github.com/owner/repo/releases/download/v1.0.0/app.js",
      "https://github.com/owner/repo/releases/download/v1.0.0/runtime",
      "https://github.com./owner/repo/releases/download/v1.0.0/runtime",
      "https://esm.sh./vue@3/dist/vue.runtime.esm-browser.js"
    ];
    for (const forbiddenAssetUrl of forbiddenAssetUrls) {
      assetUrl = forbiddenAssetUrl;
      await assert.rejects(
        fetchAdminRemoteShellStoredResponse(
          "https://example.test/index.html",
          { adminPath: "/admin" },
          { ok: true, missing: [] }
        ),
        /asset policy invalid/
      );
    }
  });
});

test("remote shell rejects importmaps and rewrites semantic assets without extensions", async () => {
  let html = '<!doctype html><html><head><script type="importmap">{"imports":{}}</script></head><body><div id="app"></div></body></html>';
  await withWorkerGlobals({
    fetch: async () => new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    })
  }, async () => {
    await assert.rejects(
      fetchAdminRemoteShellStoredResponse(
        "https://example.test/index.html",
        { adminPath: "/admin" },
        { ok: true, missing: [] }
      ),
      /importmap/
    );

    html = `<!doctype html><html><head>
      <script src='https://cdn.tailwindcss.com'></script>
      <link rel="modulepreload" href="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.prod.js">
      <link rel="preload" as="style" href="https://cdn.jsdelivr.net/npm/example@1.0.0/theme">
    </head><body><div id="app"></div></body></html>`;
    const payload = await fetchAdminRemoteShellStoredResponse(
      "https://example.test/index.html",
      { adminPath: "/admin" },
      { ok: true, missing: [] },
      null,
      { adminPath: "/admin", releaseTag: "v1.0.0" }
    );
    const renderedHtml = await payload.storedResponse.text();
    assert.equal(payload.vendorManifest.entries.length, 3);
    assert.doesNotMatch(renderedHtml, /https:\/\/cdn\.tailwindcss\.com/);
    assert.match(renderedHtml, /\/admin\/__release\/v1\.0\.0\/vendor\//);
  });
});

test("local index uploads use the remote shell policy and a content-addressed source", async () => {
  const validHtml = `<!doctype html><html><head>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="modulepreload" href="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.prod.js">
  </head><body><div id="app"></div></body></html>`;
  const record = await buildAdminLocalIndexUploadRecord(validHtml, "C:\\exports\\index.html");
  assert.match(record.sourceUrl, /^https:\/\/admin-local-index\.invalid\/[a-f0-9]{64}\/index\.html$/);
  assert.match(record.assetRevision, /^local-[a-f0-9]{64}$/);
  assert.equal(record.fileName, "index.html");
  assert.equal(record.manifest.entries.length, 2);

  await assert.rejects(
    buildAdminLocalIndexUploadRecord('<!doctype html><html><body><div id="app"></div><script src="/assets/app.js"></script></body></html>'),
    /asset policy invalid/
  );
  await assert.rejects(
    buildAdminLocalIndexUploadRecord('<!doctype html><html><head><script type="importmap">{}</script></head><body><div id="app"></div></body></html>'),
    /asset policy invalid/
  );
  await assert.rejects(
    buildAdminLocalIndexUploadRecord('<!doctype html><html><body><div id="app"></div><script>void import("https://evil.test/runtime.js")</script></body></html>'),
    /动态 import/
  );
});

test("admin index resolution ignores Release fields and environment INDEX_URL", () => {
  const resolved = buildResolvedAdminIndexState(
    { INDEX_URL: "https://example.test/index.html" },
    {
      releaseRepo: "axuitomo/CF-EMBY-PROXY-UI",
      releaseBranch: "main",
      releaseTag: "v1.0.0",
      indexUrl: "https://example.test/index.html"
    }
  );
  assert.equal(resolved.indexUrl, "");
  assert.equal(resolved.indexUrlSource, "unset");
  assert.equal(resolved.hasGithubRelease, false);
  assert.equal(resolved.gateState, "setup_required");
});

test("Worker and HTML update requires both uploaded files", async () => {
  const { kv } = createInMemoryKvStore({ [kernel.CONFIG_KEY]: {} });
  const env = { ENI_KV: kv, __CONFIG_CACHE_NAMESPACE: "worker-html-files-required" };
  invalidateRuntimeConfigCache();
  const validHtml = '<!doctype html><html><body><div id="app"></div></body></html>';
  const cases = [
    {
      workerFileName: "worker.js",
      workerScriptContent: "export default { fetch() { return new Response('ok'); } }"
    },
    {
      indexFileName: "index.html",
      indexHtml: validHtml
    }
  ];

  for (const data of cases) {
    const response = await adminActions.updateWorkerAndAdminIndex(data, {
      env,
      kv,
      ctx: null,
      request: new Request("https://worker.test/admin")
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "WORKER_HTML_FILES_REQUIRED");
  }
});

test("local index source persists in KV and renders through the same-origin vendor path", async () => {
  const { kv } = createInMemoryKvStore({ "sys:theme": {} });
  const env = { ADMIN_PATH: "/admin", ENI_KV: kv };
  const html = '<!doctype html><html><head><script src="https://cdn.example.test/app.js"></script></head><body><div id="app"></div></body></html>';
  const record = await buildAdminLocalIndexUploadRecord(html, "index.html");
  const persisted = await kernel.persistAdminIndexUpload(record, { env, kv });
  const resolved = buildResolvedAdminIndexState({}, persisted.config);
  assert.equal(resolved.indexUrlSource, "local_upload");
  assert.equal(resolved.localUploadRevision, record.revision);
  assert.equal((await kernel.getAdminIndexUploadRecord(kv, record.revision)).html, html);

  const response = await renderAdminPage(
    new Request("https://worker.test/admin"),
    env,
    null,
    { ok: true, missing: [] },
    persisted.config
  );
  const rendered = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(rendered, /https:\/\/cdn\.example\.test\/app\.js/);
  assert.match(rendered, new RegExp(`/admin/__release/${record.assetRevision}/vendor/`));

  await withWorkerGlobals({
    fetch: async (url) => {
      assert.equal(url, "https://cdn.example.test/app.js");
      return new Response("window.localVendorLoaded=true;", {
        headers: { "Content-Type": "application/javascript" }
      });
    }
  }, async () => {
    const vendorResponse = await renderAdminReleaseVendorAsset(
      new Request(`https://worker.test/admin/__release/${record.assetRevision}/vendor/${record.manifest.entries[0].assetKey}`),
      env,
      null,
      { releaseTag: record.assetRevision, assetKey: record.manifest.entries[0].assetKey },
      persisted.config
    );
    assert.equal(vendorResponse.status, 200);
    assert.match(await vendorResponse.text(), /localVendorLoaded/);
  });
});

test("local index upload replaces a corrupted record under the same revision", async () => {
  const html = '<!doctype html><html><body><div id="app"></div></body></html>';
  const record = await buildAdminLocalIndexUploadRecord(html, "index.html");
  const uploadKey = kernel.buildAdminIndexUploadKey(record.revision);
  const corruptedRecord = {
    ...record,
    html: '<!doctype html><html><body><div id="app">corrupted</div></body></html>'
  };
  const { kv, storedValues, putKeys } = createInMemoryKvStore({
    [kernel.CONFIG_KEY]: {},
    [uploadKey]: corruptedRecord
  });
  const env = {
    ADMIN_PATH: "/admin",
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: "local-index-corrupt-record"
  };
  invalidateRuntimeConfigCache();

  const persisted = await kernel.persistAdminIndexUpload(record, { env, kv });

  assert.equal(persisted.record.html, html);
  assert.equal(JSON.parse(storedValues.get(uploadKey)).html, html);
  assert.ok(putKeys.includes(uploadKey));
  assert.equal((await kernel.getAdminIndexUploadRecord(kv, record.revision)).html, html);
});

test("fresh remote shell enforces the byte limit after reading the body", async () => {
  const html = `<!doctype html><html><body><div id="app">${"x".repeat(2 * 1024 * 1024)}</div></body></html>`;
  await withWorkerGlobals({
    fetch: async () => new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    })
  }, async () => {
    await assert.rejects(
      fetchAdminRemoteShellStoredResponse(
        "https://example.test/index.html",
        { adminPath: "/admin" },
        { ok: true, missing: [] }
      ),
      /payload invalid: \d+ bytes/
    );
  });
});

test("jsDelivr GitHub mutable-ref classifier distinguishes branches from immutable refs", () => {
  assert.equal(isMutableJsdelivrGithubAssetUrl("https://cdn.jsdelivr.net/gh/owner/repo/app.js"), true);
  assert.equal(isMutableJsdelivrGithubAssetUrl("https://cdn.jsdelivr.net./gh/owner/repo/app.js"), true);
  assert.equal(isMutableJsdelivrGithubAssetUrl("https://cdn.jsdelivr.net/gh/owner/repo@main/app.js"), true);
  assert.equal(isMutableJsdelivrGithubAssetUrl("https://cdn.jsdelivr.net/gh/owner/repo@latest/app.js"), true);
  assert.equal(isMutableJsdelivrGithubAssetUrl("https://cdn.jsdelivr.net/gh/owner/repo@1.2/app.js"), true);
  assert.equal(isMutableJsdelivrGithubAssetUrl("https://cdn.jsdelivr.net/gh/owner/repo@abcdef0/app.js"), false);
  assert.equal(isMutableJsdelivrGithubAssetUrl("https://cdn.jsdelivr.net/gh/owner/repo@v1.2.3-beta.1/app.js"), false);
  assert.equal(isMutableJsdelivrGithubAssetUrl("https://cdn.jsdelivr.net/npm/vue@latest/dist/vue.js"), false);
});

test("mutable vendor assets bypass asset cache and return no-store", async () => {
  const upstreamUrl = "https://cdn.jsdelivr.net./gh/owner/repo/app.js";
  const indexRecord = await buildAdminLocalIndexUploadRecord(
    `<!doctype html><html><head><script src="${upstreamUrl}"></script></head><body><div id="app"></div></body></html>`,
    "index.html"
  );
  const manifestEntry = indexRecord.manifest.entries[0];
  const { kv } = createInMemoryKvStore({
    [kernel.buildAdminIndexUploadKey(indexRecord.revision)]: indexRecord
  });
  const env = { ENI_KV: kv };
  const cacheReads = [];
  const cacheWrites = [];
  const edgeCache = {
    async match(request) {
      const url = new URL(request.url);
      cacheReads.push(url.hostname);
      if (url.hostname === "admin-release-vendor-manifest.invalid") {
        return new Response(JSON.stringify({
          ...indexRecord.manifest,
          entries: [manifestEntry]
        }));
      }
      return null;
    },
    async put(request) {
      cacheWrites.push(new URL(request.url).hostname);
    }
  };

  await withWorkerGlobals({
    caches: { default: edgeCache },
    fetch: async (url) => {
      assert.equal(url, upstreamUrl);
      return new Response("window.mutableAssetLoaded=true;", {
        headers: { "Content-Type": "application/javascript" }
      });
    }
  }, async () => {
    const response = await renderAdminReleaseVendorAsset(
      new Request(`https://worker.test/admin/__release/${indexRecord.assetRevision}/vendor/${manifestEntry.assetKey}`),
      env,
      null,
      { releaseTag: indexRecord.assetRevision, assetKey: manifestEntry.assetKey },
      {}
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
    assert.match(await response.text(), /mutableAssetLoaded/);
  });

  assert.deepEqual(cacheReads, ["admin-release-vendor-manifest.invalid"]);
  assert.deepEqual(cacheWrites, []);
});

test("immutable vendor assets use asset cache and immutable browser policy", async () => {
  const upstreamUrl = "https://cdn.jsdelivr.net/gh/owner/repo@v1.2.3/app.js";
  const indexRecord = await buildAdminLocalIndexUploadRecord(
    `<!doctype html><html><head><script src="${upstreamUrl}"></script></head><body><div id="app"></div></body></html>`,
    "index.html"
  );
  const manifestEntry = indexRecord.manifest.entries[0];
  const { kv } = createInMemoryKvStore({
    [kernel.buildAdminIndexUploadKey(indexRecord.revision)]: indexRecord
  });
  const env = { ENI_KV: kv };
  const cacheReads = [];
  const cacheWrites = [];
  const edgeCache = {
    async match(request) {
      const url = new URL(request.url);
      cacheReads.push(url.hostname);
      if (url.hostname === "admin-release-vendor-manifest.invalid") {
        return new Response(JSON.stringify({
          ...indexRecord.manifest,
          entries: [manifestEntry]
        }));
      }
      return null;
    },
    async put(request) {
      cacheWrites.push(new URL(request.url).hostname);
    }
  };

  await withWorkerGlobals({
    caches: { default: edgeCache },
    fetch: async (url) => {
      assert.equal(url, upstreamUrl);
      return new Response("window.immutableAssetLoaded=true;", {
        headers: { "Content-Type": "application/javascript" }
      });
    }
  }, async () => {
    const response = await renderAdminReleaseVendorAsset(
      new Request(`https://worker.test/admin/__release/${indexRecord.assetRevision}/vendor/${manifestEntry.assetKey}`),
      env,
      null,
      { releaseTag: indexRecord.assetRevision, assetKey: manifestEntry.assetKey },
      {}
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
    assert.match(await response.text(), /immutableAssetLoaded/);
  });

  assert.deepEqual(cacheReads, [
    "admin-release-vendor-manifest.invalid",
    "admin-release-vendor-cache.invalid"
  ]);
  assert.deepEqual(cacheWrites, ["admin-release-vendor-cache.invalid"]);
});

test("isolate cache defaults preserve bounded proxy headroom", () => {
  assert.ok(Config.Defaults.NodeCacheMax <= 512);
  assert.ok(Config.Defaults.PlaybackRouteHotCacheMax <= 256);
  assert.ok(Config.Defaults.PlaybackInfoCacheMax <= 64);
  assert.ok(Config.Defaults.PlaybackInfoCacheTotalMaxBytes <= 4 * 1024 * 1024);
  assert.ok(Config.Defaults.VideoProgressForwardSessionMax <= 128);
  assert.ok(Config.Defaults.BufferedRetryBodyMaxBytes <= 256 * 1024);
  assert.ok(Config.Defaults.LogQueueMax <= 512);
  assert.ok(Config.Defaults.LogDedupeMax <= 2048);
  assert.ok(Config.Defaults.LogFlushCountThreshold >= 100);
  assert.ok(Config.Defaults.OpsStatusReadCacheTtlMs <= 15 * 1000);
});

test("API MIME guard replaces an upstream frontend document with structured JSON", async () => {
  const upstreamState = {
    response: new Response("<!doctype html><title>Frontend</title>", {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": "42",
        "Content-Encoding": "gzip",
        "ETag": "frontend-shell"
      }
    })
  };
  const result = await proxyService.guardApiResponseMime({
    request: new Request("https://worker.test/alpha/System/Info", {
      headers: { Accept: "application/json" }
    }),
    requestMethod: "GET",
    requestTraits: { isApiRequest: true }
  }, upstreamState);

  assert.notEqual(result, upstreamState);
  assert.equal(result.response.status, 502);
  assert.equal(result.response.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(result.response.headers.get("Cache-Control"), "no-store");
  assert.equal(result.response.headers.get("X-Proxy-Mime-Guard"), "html-document");
  assert.equal(result.response.headers.get("Content-Length"), null);
  assert.equal(result.response.headers.get("Content-Encoding"), null);
  assert.equal(result.response.headers.get("ETag"), null);
  assert.deepEqual(await result.response.json(), {
    error: "Bad Gateway",
    code: 502,
    message: "Upstream API returned an HTML document instead of API data.",
    details: {
      upstreamStatus: 200,
      contentType: "text/html"
    }
  });
});

test("API MIME guard preserves explicit root navigation and legitimate non-HTML API responses", async () => {
  const htmlState = {
    response: new Response("<!doctype html><title>Emby</title>", {
      headers: { "Content-Type": "text/html" }
    })
  };
  const documentExecution = {
    request: new Request("https://worker.test/alpha/", {
      headers: { Accept: "text/html,application/xhtml+xml" }
    }),
    requestMethod: "GET",
    proxyPath: "/",
    requestTraits: { isApiRequest: true }
  };
  assert.equal(await proxyService.guardApiResponseMime(documentExecution, htmlState), htmlState);
  for (const accept of ["*/*", "text/*;q=0.5"]) {
    assert.equal(await proxyService.guardApiResponseMime({
      ...documentExecution,
      request: new Request("https://worker.test/alpha/", { headers: { Accept: accept } })
    }, htmlState), htmlState);
  }
  const explicitlyRejectedHtml = await proxyService.guardApiResponseMime({
    ...documentExecution,
    request: new Request("https://worker.test/alpha/", {
      headers: { Accept: "*/*;q=1, text/html;q=0" }
    })
  }, htmlState);
  assert.equal(explicitlyRejectedHtml.response.status, 502);
  assert.equal(explicitlyRejectedHtml.response.headers.get("X-Proxy-Mime-Guard"), "html-document");

  const textState = {
    response: new Response("Emby Server", { headers: { "Content-Type": "text/plain" } })
  };
  const apiExecution = {
    request: new Request("https://worker.test/alpha/System/Ping", {
      headers: { Accept: "application/json" }
    }),
    requestMethod: "GET",
    requestTraits: { isApiRequest: true }
  };
  assert.equal(await proxyService.guardApiResponseMime(apiExecution, textState), textState);

  const staticState = {
    response: new Response("<!doctype html><title>Asset</title>", {
      headers: { "Content-Type": "text/html" }
    })
  };
  assert.equal(await proxyService.guardApiResponseMime({
    ...apiExecution,
    requestTraits: { isApiRequest: false, isStaticFile: true }
  }, staticState), staticState);
});

test("API MIME guard does not sniff generic bodies and does not treat q=0 as document acceptance", async () => {
  for (const contentType of ["text/plain", "application/octet-stream", ""]) {
    const headers = contentType ? { "Content-Type": contentType } : {};
    const body = "\uFEFF<!-- edge fallback --><!doctype html><html><body>Frontend</body></html>";
    const upstreamState = {
      response: new Response(contentType ? body : new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        }
      }), { headers })
    };
    const result = await proxyService.guardApiResponseMime({
      request: new Request("https://worker.test/alpha/", {
        headers: { Accept: "application/json" }
      }),
      requestMethod: "GET",
      proxyPath: "/",
      requestTraits: { isApiRequest: true }
    }, upstreamState);
    assert.equal(result, upstreamState);
    assert.equal((await result.response.text()).replace(/^\uFEFF/, ""), body.replace(/^\uFEFF/, ""));
  }

  for (const contentType of ["text/html", "application/xhtml+xml"]) {
    const result = await proxyService.guardApiResponseMime({
      request: new Request("https://worker.test/alpha/", {
        headers: { Accept: "application/json, text/html;q=0, application/xhtml+xml;q=0" }
      }),
      requestMethod: "GET",
      proxyPath: "/",
      requestTraits: { isApiRequest: true }
    }, {
      response: new Response("<html><body>Frontend</body></html>", {
        headers: { "Content-Type": contentType }
      })
    });
    assert.equal(result.response.status, 502);
    assert.equal(result.response.headers.get("X-Proxy-Mime-Guard"), "html-document");
    assert.equal((await result.response.json()).details.contentType, contentType);
  }
});

test("PlaybackInfo contract preserves HEAD and no-content responses", async () => {
  for (const [requestMethod, status] of [["HEAD", 200], ["POST", 204], ["POST", 205]]) {
    const upstreamState = {
      response: new Response(null, { status, headers: { "Content-Type": "text/plain" } })
    };
    const result = await proxyService.guardPlaybackInfoResponseContract({
      requestMethod,
      requestTraits: { isPlaybackInfoRequest: true }
    }, upstreamState);
    assert.equal(result, upstreamState);
  }
});

test("production PlaybackInfo stages stop after contract rejection", async () => {
  const execution = {
    request: new Request("https://worker.test/alpha/Items/1/PlaybackInfo", {
      method: "POST",
      headers: { Accept: "application/json" }
    }),
    requestMethod: "POST",
    requestUrl: new URL("https://worker.test/alpha/Items/1/PlaybackInfo"),
    rawRequestUrl: new URL("https://worker.test/alpha/Items/1/PlaybackInfo"),
    proxyPath: "/Items/1/PlaybackInfo",
    requestTraits: {
      isApiRequest: true,
      isPlaybackInfoRequest: true,
      isPlaybackCriticalRequest: true
    },
    effectivePlaybackInfoMode: "rewrite",
    playbackInfoRewrite: "",
    playbackInfoCacheEnabled: false,
    playbackInfoCacheState: "skip",
    playbackInfoCacheTtlSec: 0,
    playbackAbsoluteFallbackEligible: false,
    dynamicCors: {},
    finalOrigin: "*",
    nodeName: "alpha",
    nodeKey: "",
    nodeDerivedCacheRevision: "rev-1",
    targetHotCacheState: "miss",
    routingDecisionMode: "default"
  };
  const upstreamState = {
    response: new Response(JSON.stringify("frontend-shell"), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }),
    finalUrl: new URL("https://origin.test/Items/1/PlaybackInfo"),
    activeTargetBase: new URL("https://origin.test")
  };
  const originalRewrite = proxyService.maybeRewritePlaybackInfoResponse;
  const originalRecordAccessLog = proxyService.recordAccessLog;
  let rewriteCalled = false;
  let accessLogPayload = null;
  proxyService.maybeRewritePlaybackInfoResponse = async (...args) => {
    rewriteCalled = true;
    return originalRewrite(...args);
  };
  proxyService.recordAccessLog = (_execution, payload) => {
    accessLogPayload = payload;
  };
  try {
    const response = await proxyService.buildSuccessResponse(execution, {}, upstreamState);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("X-Proxy-Contract-Guard"), "playback-info");
    assert.equal((await response.json()).details.reason, "invalid_root_object");
  } finally {
    proxyService.maybeRewritePlaybackInfoResponse = originalRewrite;
    proxyService.recordAccessLog = originalRecordAccessLog;
  }

  assert.equal(rewriteCalled, false);
  assert.equal(execution.playbackInfoRewrite, "rejected");
  assert.equal(accessLogPayload?.detailJson?.playbackInfoRewrite, "rejected");
  assert.match(proxyService.buildPlaybackInfoCacheDiagnosticDetail(execution), /PlaybackInfoRewrite=rejected/);
});

test("local firewall, rate-limit, and invalid-target errors remain text responses", async () => {
  const firewallResponse = proxyService.evaluateFirewall({ ipBlacklist: "198.51.100.41" }, "198.51.100.41", "US", "*");
  assert.equal(firewallResponse.status, 403);
  assert.equal(await firewallResponse.text(), "Forbidden by IP Firewall");

  const rateLimitConfig = { rateLimitRpm: 1 };
  const requestTraits = { isPlaybackCriticalRequest: false };
  assert.equal(proxyService.applyRateLimit(rateLimitConfig, "198.51.100.42", requestTraits, 1000, "*"), null);
  const rateLimitResponse = proxyService.applyRateLimit(rateLimitConfig, "198.51.100.42", requestTraits, 1000, "*");
  assert.equal(rateLimitResponse.status, 429);
  assert.equal(await rateLimitResponse.text(), "Rate Limit Exceeded");

  const { invalidResponse } = proxyService.parseTargetRecords({ target: "" }, "*");
  assert.equal(invalidResponse.status, 502);
  assert.equal(await invalidResponse.text(), "Invalid Node Target");
});

test("oversized PlaybackInfo responses are not retained in isolate memory", async () => {
  isolateState.PlaybackInfoResponseCache.clear();
  const execution = {
    requestTraits: { isPlaybackInfoRequest: true },
    playbackInfoCacheKey: "playback-info:oversized",
    requestMethod: "POST",
    playbackInfoCacheTtlSec: 60,
    nodeName: "alpha",
    nodeDerivedCacheRevision: "rev-1"
  };
  const oversizedBody = "x".repeat(Config.Defaults.PlaybackInfoCacheEntryMaxBytes + 1);
  const stored = await proxyService.storePlaybackInfoResponseCache(execution, new Response(oversizedBody, {
    headers: { "Content-Type": "application/json" }
  }));
  assert.equal(stored, false);
  assert.equal(isolateState.PlaybackInfoResponseCache.size, 0);
});

test("oversized PlaybackInfo objects are rejected by the contract guard", { timeout: 2000 }, async () => {
  const oversizedBody = JSON.stringify({ padding: "x".repeat(Config.Defaults.PlaybackInfoCacheEntryMaxBytes + 1) });
  const response = new Response(oversizedBody, {
    headers: { "Content-Type": "application/json" }
  });
  const upstreamState = { response };
  const execution = {
    requestTraits: { isPlaybackInfoRequest: true },
    effectivePlaybackInfoMode: "rewrite",
    requestMethod: "POST",
    playbackInfoRewrite: ""
  };
  const result = await proxyService.maybeRewritePlaybackInfoResponse(execution, upstreamState);
  assert.equal(result.response.status, 502);
  assert.equal(execution.playbackInfoRewrite, "rejected");
  assert.equal(result.response.headers.get("X-Proxy-Contract-Guard"), "playback-info");
  assert.equal((await result.response.json()).details.reason, "body_too_large");
});

test("PlaybackInfo passthrough decodes nested object fields and removes invalid entries", async () => {
  const execution = {
    requestTraits: { isPlaybackInfoRequest: true },
    effectivePlaybackInfoMode: "passthrough",
    requestMethod: "POST",
    playbackInfoRewrite: ""
  };
  const upstreamState = {
    response: new Response(JSON.stringify({
      PlaySessionId: "session-1",
      MediaSources: JSON.stringify([
        JSON.stringify({
          Id: "encoded-source",
          MediaStreams: [JSON.stringify({ Index: 0, Codec: "h264" }), "invalid-stream"],
          MediaAttachments: JSON.stringify([{ Codec: "srt" }, null]),
          RequiredHttpHeaders: JSON.stringify({ "X-Media-Token": "token" })
        }),
        {
          Id: "valid-source",
          Path: "/Videos/1/stream",
          MediaStreams: "invalid-streams",
          MediaAttachments: null,
          RequiredHttpHeaders: "invalid-headers"
        },
        null,
        ["array-source"]
      ])
    }), {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "999",
        "ETag": "stale-etag",
        "Digest": "sha-256=stale",
        "X-Upstream": "preserved"
      }
    })
  };

  const result = await proxyService.maybeRewritePlaybackInfoResponse(execution, upstreamState);
  assert.notEqual(result, upstreamState);
  assert.equal(execution.playbackInfoRewrite, "applied");
  assert.deepEqual(await result.response.json(), {
    PlaySessionId: "session-1",
    MediaSources: [
      {
        Id: "encoded-source",
        MediaStreams: [{ Index: 0, Codec: "h264" }],
        MediaAttachments: [{ Codec: "srt" }],
        RequiredHttpHeaders: { "X-Media-Token": "token" }
      },
      {
        Id: "valid-source",
        Path: "/Videos/1/stream",
        MediaStreams: [],
        MediaAttachments: [],
        RequiredHttpHeaders: {}
      }
    ]
  });
  assert.equal(result.response.headers.get("Content-Length"), null);
  assert.equal(result.response.headers.get("ETag"), null);
  assert.equal(result.response.headers.get("Digest"), null);
  assert.equal(result.response.headers.get("X-Upstream"), "preserved");
});

test("PlaybackInfo passthrough replaces an invalid media source container with an empty array", async () => {
  const execution = {
    requestTraits: { isPlaybackInfoRequest: true },
    effectivePlaybackInfoMode: "passthrough",
    requestMethod: "POST",
    playbackInfoRewrite: ""
  };
  const upstreamState = {
    response: new Response(JSON.stringify({ MediaSources: "invalid-sources" }), {
      headers: { "Content-Type": "application/json" }
    })
  };

  const result = await proxyService.maybeRewritePlaybackInfoResponse(execution, upstreamState);
  assert.deepEqual((await result.response.json()).MediaSources, []);
  assert.equal(execution.playbackInfoRewrite, "applied");
});

test("valid PlaybackInfo passthrough keeps the original response unchanged", async () => {
  const bodyText = '{\n  "MediaSources": [{"Id":"valid-source","MediaStreams":[{"Index":0}],"MediaAttachments":[],"RequiredHttpHeaders":{}}],\n  "Marker": "original-bytes"\n}';
  const execution = {
    requestTraits: { isPlaybackInfoRequest: true },
    effectivePlaybackInfoMode: "passthrough",
    requestMethod: "POST",
    playbackInfoRewrite: ""
  };
  const upstreamState = {
    response: new Response(bodyText, {
      headers: { "Content-Type": "application/json", "ETag": "preserved-etag" }
    })
  };

  const result = await proxyService.maybeRewritePlaybackInfoResponse(execution, upstreamState);
  assert.notEqual(result, upstreamState);
  assert.equal(result.response, upstreamState.response);
  assert.equal(result.playbackInfoRepresentation.contract, "playback-info");
  assert.equal(result.playbackInfoRepresentation.response, upstreamState.response);
  assert.equal(Object.isFrozen(result.playbackInfoRepresentation), true);
  assert.equal(execution.playbackInfoRewrite, "passthrough");
  assert.equal(result.response.headers.get("ETag"), "preserved-etag");
  assert.equal(await result.response.text(), bodyText);
});

test("PlaybackInfo rejects unsupported MIME and oversized responses as structured JSON", async () => {
  const makeExecution = () => ({
    requestTraits: { isPlaybackInfoRequest: true },
    effectivePlaybackInfoMode: "passthrough",
    requestMethod: "POST",
    playbackInfoRewrite: ""
  });
  const textState = {
    response: new Response("upstream text", { headers: { "Content-Type": "text/plain" } })
  };
  const textExecution = makeExecution();
  const textResult = await proxyService.maybeRewritePlaybackInfoResponse(textExecution, textState);
  assert.equal(textResult.response.status, 502);
  assert.equal(textExecution.playbackInfoRewrite, "rejected");
  assert.equal(textResult.response.headers.get("X-Proxy-Contract-Guard"), "playback-info");
  assert.equal(textResult.response.headers.get("X-Proxy-Mime-Guard"), null);
  assert.equal((await textResult.response.json()).details.reason, "unsupported_content_type");

  const oversizedBody = "x".repeat(Config.Defaults.PlaybackInfoCacheEntryMaxBytes + 1);
  const oversizedState = {
    response: new Response(oversizedBody, { headers: { "Content-Type": "application/json" } })
  };
  const oversizedExecution = makeExecution();
  const oversizedResult = await proxyService.maybeRewritePlaybackInfoResponse(oversizedExecution, oversizedState);
  assert.equal(oversizedResult.response.status, 502);
  assert.equal(oversizedExecution.playbackInfoRewrite, "rejected");
  assert.equal((await oversizedResult.response.json()).details.reason, "body_too_large");
});

test("PlaybackInfo rejects double-encoded and text/plain JSON objects", async () => {
  const makeExecution = () => ({
    requestTraits: { isPlaybackInfoRequest: true },
    effectivePlaybackInfoMode: "passthrough",
    requestMethod: "POST",
    playbackInfoRewrite: ""
  });
  const payload = { PlaySessionId: "session-1", MediaSources: [] };
  for (const [body, contentType, reason] of [
    [JSON.stringify(JSON.stringify(payload)), "application/json", "invalid_root_object"],
    [JSON.stringify(payload), "text/plain", "unsupported_content_type"]
  ]) {
    const result = await proxyService.maybeRewritePlaybackInfoResponse(makeExecution(), {
      response: new Response(body, {
        headers: { "Content-Type": contentType, "Content-Length": String(body.length), ETag: "stale" }
      })
    });
    assert.equal(result.response.status, 502);
    assert.equal(result.response.headers.get("Content-Type"), "application/json; charset=utf-8");
    assert.equal(result.response.headers.get("Content-Length"), null);
    assert.equal(result.response.headers.get("ETag"), null);
    assert.equal(result.response.headers.get("X-Proxy-Contract-Guard"), "playback-info");
    assert.equal((await result.response.json()).details.reason, reason);
  }
});

test("PlaybackInfo rejects arrays, scalars, null, malformed JSON, and JSONP media types", async () => {
  const cases = [
    { body: JSON.stringify("frontend"), contentType: "application/json", reason: "invalid_root_object" },
    { body: JSON.stringify([]), contentType: "text/json", reason: "invalid_root_object" },
    { body: JSON.stringify(42), contentType: "application/problem+json", reason: "invalid_root_object" },
    { body: "null", contentType: "application/json", reason: "invalid_root_object" },
    { body: "{broken", contentType: "application/json", reason: "invalid_root_object" },
    { body: "{}", contentType: "application/json,text/html", reason: "unsupported_content_type" },
    { body: "callback({})", contentType: "application/jsonp", reason: "unsupported_content_type" }
  ];
  for (const fixture of cases) {
    const execution = {
      requestTraits: { isPlaybackInfoRequest: true },
      effectivePlaybackInfoMode: "passthrough",
      requestMethod: "POST",
      playbackInfoRewrite: ""
    };
    const result = await proxyService.maybeRewritePlaybackInfoResponse(execution, {
      response: new Response(fixture.body, { headers: { "Content-Type": fixture.contentType } })
    });
    assert.equal(result.response.status, 502);
    assert.equal(result.response.headers.get("Content-Type"), "application/json; charset=utf-8");
    assert.equal(execution.playbackInfoRewrite, "rejected");
    assert.equal((await result.response.json()).details.reason, fixture.reason);
  }
});

test("PlaybackInfo cache store rejects responses without a valid representation", async () => {
  isolateState.PlaybackInfoResponseCache.clear();
  const execution = {
    requestTraits: { isPlaybackInfoRequest: true },
    playbackInfoCacheKey: "playback-info:scalar",
    requestMethod: "POST",
    playbackInfoCacheTtlSec: 60,
    nodeName: "alpha",
    nodeDerivedCacheRevision: "rev-1"
  };
  const response = new Response(JSON.stringify({ MediaSources: [] }), {
    headers: { "Content-Type": "application/json" }
  });
  const forgedRepresentation = Object.freeze({
    contract: "playback-info",
    response,
    bodyText: JSON.stringify({ MediaSources: [] }),
    bodyBytes: 19,
    payload: { MediaSources: [] }
  });
  assert.equal(await proxyService.storePlaybackInfoResponseCache(execution, response), false);
  assert.equal(await proxyService.storePlaybackInfoResponseCache(execution, response, null, forgedRepresentation), false);
  assert.equal(isolateState.PlaybackInfoResponseCache.size, 0);
});

test("PlaybackInfo cache evicts legacy invalid entries before delivery", async () => {
  isolateState.PlaybackInfoResponseCache.clear();
  const execution = {
    requestTraits: { isPlaybackInfoRequest: true },
    playbackInfoCacheEnabled: true,
    playbackInfoCacheTtlSec: 60,
    requestMethod: "GET",
    nodeName: "alpha",
    nodeDerivedCacheRevision: "rev-1",
    effectivePlaybackInfoMode: "passthrough",
    playbackInfoRewriteUrlMode: "relative",
    proxyPath: "/Items/1/PlaybackInfo",
    requestUrl: new URL("https://worker.test/alpha/Items/1/PlaybackInfo"),
    request: new Request("https://worker.test/alpha/Items/1/PlaybackInfo"),
    dynamicCors: {},
    finalOrigin: "*"
  };
  const cacheKey = proxyService.buildPlaybackInfoCacheKey(execution);
  for (const fixture of [
    { contentType: "application/json", bodyText: JSON.stringify("frontend") },
    { contentType: "application/json", bodyText: "{broken" },
    { contentType: "text/plain", bodyText: "{}" },
    { contentType: "application/json", bodyText: JSON.stringify({ padding: "x".repeat(Config.Defaults.PlaybackInfoCacheEntryMaxBytes) }) }
  ]) {
    isolateState.PlaybackInfoResponseCache.set(cacheKey, {
      status: 200,
      statusText: "OK",
      headers: [["Content-Type", fixture.contentType]],
      bodyText: fixture.bodyText,
      bodyBytes: 1,
      expiresAt: Date.now() + 60000
    });

    assert.equal(await proxyService.tryServePlaybackInfoResponseCache(execution), null);
    assert.equal(execution.playbackInfoCacheState, "miss");
    assert.equal(isolateState.PlaybackInfoResponseCache.has(cacheKey), false);
  }
});

test("PlaybackInfo rewrite reuses its bounded body snapshot for isolate caching", async () => {
  isolateState.PlaybackInfoResponseCache.clear();
  const originalCloneDescriptor = Object.getOwnPropertyDescriptor(Response.prototype, "clone");
  const originalClone = originalCloneDescriptor.value;
  let cloneCount = 0;
  Response.prototype.clone = function countedClone() {
    cloneCount += 1;
    return originalClone.call(this);
  };
  try {
    const execution = {
      requestTraits: { isPlaybackInfoRequest: true },
      effectivePlaybackInfoMode: "rewrite",
      requestMethod: "POST",
      playbackInfoRewrite: "",
      playbackInfoRewriteUrlMode: "relative",
      playbackInfoCacheKey: "playback-info:single-read",
      playbackInfoCacheTtlSec: 60,
      nodeName: "alpha",
      nodeKey: "",
      nodeDerivedCacheRevision: "rev-1",
      proxyPath: "/Items/1/PlaybackInfo",
      requestUrl: new URL("https://worker.test/alpha/Items/1/PlaybackInfo"),
      rawRequestUrl: new URL("https://worker.test/alpha/Items/1/PlaybackInfo"),
      entryMode: "kv_route"
    };
    const upstreamState = {
      response: new Response(JSON.stringify({
        MediaSources: [{ Path: "/Videos/1/stream" }]
      }), {
        headers: { "Content-Type": "application/json" }
      }),
      activeTargetBase: new URL("https://origin.test"),
      finalUrl: new URL("https://origin.test/Items/1/PlaybackInfo")
    };

    const guardedState = await proxyService.guardPlaybackInfoResponseContract(execution, upstreamState);
    const sourcePayload = guardedState.playbackInfoRepresentation.payload;
    const sourcePayloadSnapshot = JSON.stringify(sourcePayload);
    const rewrittenState = await proxyService.maybeRewritePlaybackInfoResponse(execution, guardedState);
    assert.equal(cloneCount, 1);
    assert.equal(JSON.stringify(sourcePayload), sourcePayloadSnapshot, "rewrite must not mutate the inspected payload");
    assert.notEqual(rewrittenState.playbackInfoRepresentation.payload, sourcePayload);
    assert.ok(rewrittenState.playbackInfoRepresentation.bodyBytes > 0);

    const stored = await proxyService.storePlaybackInfoResponseCache(
      execution,
      rewrittenState.response,
      null,
      rewrittenState.playbackInfoRepresentation
    );
    assert.equal(stored, true);
    assert.equal(cloneCount, 1, "cache storage must reuse the rewrite snapshot");
    assert.equal(
      isolateState.PlaybackInfoResponseCache.get("playback-info:single-read")?.bodyText,
      rewrittenState.playbackInfoRepresentation.bodyText
    );
  } finally {
    Object.defineProperty(Response.prototype, "clone", originalCloneDescriptor);
    isolateState.PlaybackInfoResponseCache.clear();
  }
});

test("PlaybackInfo cache evicts oldest entries at its total byte budget", () => {
  isolateState.PlaybackInfoResponseCache.clear();
  const bodyText = JSON.stringify({ padding: "x".repeat(Config.Defaults.PlaybackInfoCacheEntryMaxBytes - 32) });
  const entryBytes = new TextEncoder().encode(bodyText).byteLength;
  const entryCount = Math.floor(Config.Defaults.PlaybackInfoCacheTotalMaxBytes / entryBytes) + 1;
  for (let index = 0; index < entryCount; index += 1) {
    isolateState.PlaybackInfoResponseCache.set(`entry-${index}`, {
      status: 200,
      statusText: "OK",
      headers: [["Content-Type", "application/json"]],
      bodyText,
      bodyBytes: 1,
      expiresAt: Date.now() + 60000
    });
  }
  proxyService.cleanupPlaybackInfoResponseCache();
  assert.equal(isolateState.PlaybackInfoResponseCache.has("entry-0"), false);
  assert.equal(isolateState.PlaybackInfoResponseCache.has(`entry-${entryCount - 1}`), true);
  const retainedBytes = [...isolateState.PlaybackInfoResponseCache.values()]
    .reduce((total, entry) => total + entry.bodyBytes, 0);
  assert.ok(retainedBytes <= Config.Defaults.PlaybackInfoCacheTotalMaxBytes);
  isolateState.PlaybackInfoResponseCache.clear();
});

test("unknown-length control requests stay streamed instead of being cloned into memory", async () => {
  const request = new Request("https://worker.test/Sessions/Playing/Progress", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      }
    }),
    duplex: "half"
  });
  assert.equal(request.headers.has("Content-Length"), false);
  const transport = await proxyService.buildProxyRequestState(
    request,
    {},
    "/Sessions/Playing/Progress",
    new URL(request.url),
    "203.0.113.1",
    {
      isPlaybackInfoRequest: false,
      isPlaybackSessionControlRequest: true,
      isBigStream: false,
      isSmartStrmMedia: false,
      isSegment: false,
      isManifest: false,
      isWsUpgrade: false
    },
    false,
    [],
    {}
  );
  assert.equal(transport.preparedBodyMode, "stream");
  const execution = {
    requestMethod: "POST",
    requestUrl: new URL("https://worker.test/Sessions/Playing/Progress?ItemId=query-item"),
    request
  };
  const parsed = proxyService.parsePlaybackSessionControlPayload(execution, transport);
  assert.equal(parsed.parseError, true);
  assert.equal(parsed.parseMode, "stream");
  assert.equal(parsed.parseErrorReason, "unbuffered_body");
  assert.equal(parsed.query.itemid, "query-item");

  const oversizedRequest = new Request("https://worker.test/Sessions/Playing?ItemId=oversized-query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(256 * 1024 + 1)
    },
    body: JSON.stringify({ ItemId: "body-item" })
  });
  const oversizedTransport = await proxyService.buildProxyRequestState(
    oversizedRequest,
    {},
    "/Sessions/Playing",
    new URL(oversizedRequest.url),
    "203.0.113.1",
    {
      isPlaybackInfoRequest: false,
      isPlaybackSessionControlRequest: true,
      isBigStream: false,
      isSmartStrmMedia: false,
      isSegment: false,
      isManifest: false,
      isWsUpgrade: false
    },
    false,
    [],
    {}
  );
  assert.equal(oversizedTransport.preparedBodyMode, "stream");
  const oversizedParsed = proxyService.parsePlaybackSessionControlPayload({
    requestMethod: "POST",
    requestUrl: new URL(oversizedRequest.url),
    request: oversizedRequest
  }, oversizedTransport);
  assert.equal(oversizedParsed.parseErrorReason, "unbuffered_body");
  assert.equal(oversizedParsed.query.itemid, "oversized-query");
});

test("playback progress relay enforces its bounded session table on insertion", () => {
  const relayMap = isolateState.PlaybackProgressRelay;
  relayMap.clear();
  const maxEntries = Config.Defaults.VideoProgressForwardSessionMax;
  const execution = {
    videoProgressForwardIntervalSec: 3,
    nodeName: "alpha",
    nodeDerivedCacheRevision: "rev-1",
    ctx: { waitUntil() {} }
  };
  for (let index = 0; index < maxEntries + 1; index += 1) {
    proxyService.markPlaybackProgressRelayStopped(`session-${index}`, execution);
  }
  assert.equal(relayMap.size, maxEntries);
  assert.equal(relayMap.has("session-0"), false);
  assert.equal(relayMap.has(`session-${maxEntries}`), true);
  relayMap.clear();
});

test("incremental isolate cleanup covers nonessential proxy-adjacent caches", () => {
  const now = Date.now();
  const staleCases = [
    [5, isolateState.PlaybackInfoResponseCache, "stale-playback", { expiresAt: now - 1 }],
    [6, isolateState.ProxyFailoverStateCache, "stale-failover", {
      preferredTargetExpiresAt: now - 1,
      failingTargets: new Map(),
      inFlightProbe: null,
      lastProbeResult: null
    }],
    [7, isolateState.PlaybackProgressRelay, "stale-progress", { lastTouchedAt: now - 120000 }],
    [8, isolateState.DashboardMonthlyTrafficCache, "stale-month", { staleUntil: now - 1 }]
  ];
  for (const [phase, cache, key, value] of staleCases) {
    cache.clear();
    cache.set(key, value);
    isolateState.CleanupState.phase = phase;
    isolateState.CleanupState.lastRunAt = 0;
    isolateState.CleanupState.iterators = {};
    cachePort.maybeCleanup();
    assert.equal(cache.has(key), false, `cleanup phase ${phase} should remove stale entry`);
  }
});

function createD1Recorder() {
  const prepared = [];
  const batches = [];
  const schemaColumns = [
    "id", "timestamp", "node_name", "request_path", "request_method", "status_code", "response_time", "client_ip",
    "inbound_colo", "outbound_colo", "user_agent", "referer", "category", "error_detail", "detail_json", "created_at",
    "inbound_ip", "outbound_ip", "ip", "ip_type", "source_kind", "source_label", "line_label", "remark", "updated_at",
    "name", "url", "source_type", "domain", "preset_id", "builtin_id", "enabled", "sort_order", "ip_limit",
    "last_fetch_at", "last_fetch_status", "last_fetch_count"
  ];
  const db = {
    prepare(sql) {
      const record = { sql: String(sql), bindings: [] };
      prepared.push(record);
      const statement = {
        __record: record,
        bind(...bindings) {
          record.bindings = bindings;
          return statement;
        },
        async run() {
          return { success: true };
        },
        async all() {
          if (/^PRAGMA table_info/i.test(record.sql.trim())) {
            return { results: schemaColumns.map(name => ({ name })) };
          }
          return { results: [] };
        },
        async first() {
          return null;
        }
      };
      return statement;
    },
    async batch(statements) {
      batches.push(statements.map(statement => statement.__record));
      return statements.map(() => ({ success: true }));
    }
  };
  return { db, prepared, batches };
}

test("D1 OpsStatus reads and writes reuse the binding-local hot cache", async () => {
  const recorder = createD1Recorder();
  const scope = kernel.OPS_STATUS_DB_SCOPE_ROOT;

  assert.equal(await kernel.getOpsStatusPayloadFromDb(recorder.db, scope), null);
  assert.equal(await kernel.getOpsStatusPayloadFromDb(recorder.db, scope), null);
  assert.equal(recorder.prepared.filter(record => /^SELECT payload FROM sys_status/i.test(record.sql.trim())).length, 1);
  assert.equal(recorder.prepared.filter(record => /^CREATE TABLE IF NOT EXISTS sys_status/i.test(record.sql.trim())).length, 1);

  await kernel.putOpsStatusPayloadToDb(recorder.db, scope, { log: { status: "ready" } }, Date.now());
  assert.deepEqual(await kernel.getOpsStatusPayloadFromDb(recorder.db, scope), { log: { status: "ready" } });
  const selectCountBeforePatch = recorder.prepared.filter(record => /^SELECT payload FROM sys_status/i.test(record.sql.trim())).length;
  await kernel.patchOpsStatus(recorder.db, { log: { lastFlushStatus: "success" } });
  assert.equal(
    recorder.prepared.filter(record => /^SELECT payload FROM sys_status/i.test(record.sql.trim())).length,
    selectCountBeforePatch,
    "a hot status patch must not reread root or all section scopes"
  );
  assert.equal(recorder.prepared.filter(record => /^INSERT INTO sys_status/i.test(record.sql.trim())).length, 2);
});

test("Cloudflare runtime stale fallback performs one D1 cache lookup", async () => {
  const cacheOperations = { ...kernel };
  Object.assign(cacheOperations, defineAnalyticsCacheMethods({}, cacheOperations));
  let cacheReadCount = 0;
  cacheOperations.getCfRuntimeCacheEntry = async () => {
    cacheReadCount += 1;
    return {
      payload: { cached: true },
      cachedAt: 1,
      expiresAt: 2,
      updatedAt: 1
    };
  };
  await assert.rejects(
    cacheOperations.loadCfRuntimeCachePayload({}, {
      cacheKey: "runtime:test",
      cacheGroup: "test",
      resourceId: "test",
      nowMs: 3,
      loader: async () => { throw new Error("refresh_failed"); },
      allowStale: false
    }),
    /refresh_failed/
  );
  assert.equal(cacheReadCount, 1);
});

test("D1 schema initialization is single-flight and creates current runtime indexes", async () => {
  const logRecorder = createD1Recorder();
  await Promise.all([
    kernel.ensureLogsBaseSchema(logRecorder.db),
    kernel.ensureLogsBaseSchema(logRecorder.db)
  ]);
  await kernel.ensureLogsBaseSchema(logRecorder.db);
  await Promise.all([
    kernel.ensureStatsHourlySchema(logRecorder.db),
    kernel.ensureStatsHourlySchema(logRecorder.db)
  ]);

  assert.equal(logRecorder.prepared.filter(record => /CREATE TABLE IF NOT EXISTS proxy_logs \(/.test(record.sql)).length, 1);
  assert.equal(logRecorder.prepared.filter(record => /CREATE TABLE IF NOT EXISTS proxy_stats_hourly \(/.test(record.sql)).length, 1);
  assert.ok(logRecorder.prepared.some(record => /idx_proxy_logs_client_time/.test(record.sql)));
  kernel.invalidateD1SchemaReadiness(logRecorder.db, "logs");
  await kernel.ensureLogsBaseSchema(logRecorder.db);
  assert.equal(logRecorder.prepared.filter(record => /CREATE TABLE IF NOT EXISTS proxy_logs \(/.test(record.sql)).length, 2);

  const dnsRecorder = createD1Recorder();
  await Promise.all([
    kernel.ensureDnsIpWorkspaceSchema(dnsRecorder.db),
    kernel.ensureDnsIpWorkspaceSchema(dnsRecorder.db)
  ]);
  await kernel.ensureDnsIpWorkspaceSchema(dnsRecorder.db);

  assert.equal(dnsRecorder.prepared.filter(record => /CREATE TABLE IF NOT EXISTS dns_ip_pool_items \(/.test(record.sql)).length, 1);
  assert.ok(dnsRecorder.prepared.some(record => /idx_dns_ip_pool_items_updated_ip/.test(record.sql)));
  assert.ok(dnsRecorder.prepared.some(record => /idx_dns_ip_probe_cache_colo_ip_expires/.test(record.sql)));
  kernel.invalidateD1SchemaReadiness(dnsRecorder.db, "all");
  await kernel.ensureDnsIpWorkspaceSchema(dnsRecorder.db);
  assert.equal(dnsRecorder.prepared.filter(record => /CREATE TABLE IF NOT EXISTS dns_ip_pool_items \(/.test(record.sql)).length, 2);

  const workerSource = await readFile(new URL("../worker/runtime/application-facades.js", import.meta.url), "utf8");
  assert.doesNotMatch(workerSource, /ALTER TABLE/i);
  assert.match(workerSource, /CREATE INDEX IF NOT EXISTS idx_proxy_logs_category_time/);
  assert.match(workerSource, /CREATE INDEX IF NOT EXISTS idx_dns_ip_pool_items_updated_ip/);
});

test("D1 DNS writes keep stable ids and replace sources atomically", async () => {
  const recorder = createD1Recorder();
  await kernel.upsertDnsIpPoolItems(recorder.db, [{
    id: "item-v2",
    ip: "203.0.113.10",
    sourceKind: "manual",
    sourceLabel: "manual"
  }]);
  const itemUpsertSql = recorder.prepared.find(record => /INSERT INTO dns_ip_pool_items/.test(record.sql))?.sql || "";
  assert.doesNotMatch(itemUpsertSql, /id\s*=\s*excluded\.id/);

  await kernel.persistDnsIpPoolSources({ db: recorder.db }, [{
    id: "source-1",
    name: "Example source",
    url: "https://example.test/ips.txt",
    sourceType: "url",
    sourceKind: "custom",
    enabled: true,
    sortOrder: 0,
    ipLimit: 5
  }]);
  const sourceBatch = recorder.batches.at(-1);
  assert.equal(sourceBatch.length, 2);
  assert.match(sourceBatch[0].sql, /^DELETE FROM dns_ip_pool_sources$/);
  assert.match(sourceBatch[1].sql, /^INSERT INTO dns_ip_pool_sources/);
});

test("D1 probe cache bulk reads stay within the 100 binding limit", async () => {
  const recorder = createD1Recorder();
  const ips = Array.from({ length: 99 }, (_, index) => `203.0.113.${index + 1}`);
  await kernel.getDnsIpProbeCacheEntries(recorder.db, ips, "SJC");
  const bulkQueries = recorder.prepared.filter(record => /WHERE entry_colo = \? AND expires_at > \? AND ip IN/.test(record.sql));
  assert.equal(bulkQueries.length, 2);
  assert.ok(bulkQueries.every(record => record.bindings.length <= 100));
  assert.equal(Math.max(...bulkQueries.map(record => record.bindings.length)), 100);
});

test("playback session keys are partitioned by node even when Emby session ids match", () => {
  const makeExecution = (nodeName) => ({
    nodeName,
    requestMethod: "POST",
    requestUrl: new URL("https://proxy.test/Sessions/Playing/Progress"),
    proxyPath: "/Sessions/Playing/Progress",
    clientIp: "203.0.113.10",
    request: new Request("https://proxy.test/Sessions/Playing/Progress", { method: "POST" }),
    requestTraits: { isPlaybackProgressRequest: true }
  });
  const transport = {
    preparedBodyMode: "buffered",
    preparedBodyText: JSON.stringify({ SessionId: "shared-session", PlaySessionId: "shared-play", ItemId: "movie-1" }),
    newHeaders: new Headers({ "Content-Type": "application/json" })
  };
  const first = proxyService.resolvePlaybackProgressSessionKey(makeExecution("server-a"), transport);
  const second = proxyService.resolvePlaybackProgressSessionKey(makeExecution("server-b"), transport);
  assert.equal(first.sessionKey, "server-a|session:shared-session");
  assert.equal(second.sessionKey, "server-b|session:shared-session");
  assert.notEqual(first.sessionKey, second.sessionKey);
  assert.match(first.sessionIdentityFingerprint, /^[0-9a-f]{16}$/);
  assert.match(first.sessionFingerprint, /^[0-9a-f]{16}$/);
  assert.notEqual(first.sessionFingerprint, second.sessionFingerprint);

  const deviceTransport = {
    preparedBodyMode: "buffered",
    preparedBodyText: JSON.stringify({ DeviceId: "device-strong-value", ItemId: "movie-device" }),
    newHeaders: new Headers({ "Content-Type": "application/json" })
  };
  const device = proxyService.resolvePlaybackProgressSessionKey(makeExecution("server-a"), deviceTransport);
  assert.equal(device.sessionStrength, "weak");
  assert.match(device.sessionIdentityFingerprint, /^[0-9a-f]{16}$/);
  assert.match(device.sessionFingerprint, /^[0-9a-f]{16}$/);
  assert.doesNotMatch(`${device.sessionIdentityFingerprint}:${device.sessionFingerprint}`, /device-strong-value|movie-device/);

  const makeFallbackExecution = (proxyPath) => ({
    ...makeExecution("server-a"),
    proxyPath,
    requestUrl: new URL(`https://proxy.test${proxyPath}`),
    request: new Request(`https://proxy.test${proxyPath}`, {
      method: "POST",
      headers: { Authorization: "MediaBrowser Token=private", "X-Emby-Device-Id": "device-1" }
    })
  });
  const fallbackTransport = {
    preparedBodyMode: "buffered",
    preparedBodyText: JSON.stringify({ ItemId: "movie-1" }),
    newHeaders: new Headers({ "Content-Type": "application/json" })
  };
  const started = proxyService.resolvePlaybackProgressSessionKey(makeFallbackExecution("/Sessions/Playing"), fallbackTransport);
  const stopped = proxyService.resolvePlaybackProgressSessionKey(makeFallbackExecution("/Sessions/Playing/Stopped"), fallbackTransport);
  assert.equal(started.sessionKey, stopped.sessionKey);
  assert.doesNotMatch(started.sessionKey, /private|device-1|movie-1/);
  assert.match(started.sessionIdentityFingerprint, /^[0-9a-f]{16}$/);
  assert.match(started.sessionFingerprint, /^[0-9a-f]{16}$/);
  assert.doesNotMatch(`${started.sessionIdentityFingerprint}:${started.sessionFingerprint}`, /private|device-1|movie-1/);
});
