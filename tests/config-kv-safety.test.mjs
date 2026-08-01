import assert from "node:assert/strict";
import test from "node:test";

import { createTestApplication } from "../worker/testing/hooks.js";
import {
  defineKvTidyMethods,
  defineSnapshotMethods,
  invalidateRuntimeConfigCache
} from "../worker/runtime/application-facades.js";

const hooks = createTestApplication();
assert.ok(hooks, "worker.js must expose Node test hooks");

const { testPlatform } = hooks;
const { adminActions, adminShell } = testPlatform.fetch;
const { buildAdminLocalIndexUploadRecord } = adminShell;
const kernel = testPlatform.kv;

function createDeferred() {
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createKv(initialValues = {}) {
  const values = new Map(Object.entries(initialValues).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value)
  ]));
  const kernel = [];
  return {
    values,
    kernel,
    kv: {
      async get(key, options = {}) {
        const value = values.get(key);
        if (value === undefined) return null;
        return options.type === "json" ? JSON.parse(value) : value;
      },
      async put(key, value) {
        kernel.push({ type: "put", key, value: String(value) });
        values.set(key, String(value));
      },
      async delete(key) {
        kernel.push({ type: "delete", key });
        values.delete(key);
      },
      async list(options = {}) {
        const prefix = String(options.prefix || "");
        return {
          keys: [...values.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })),
          list_complete: true
        };
      }
    }
  };
}

test("persistRuntimeConfig rejects writes when KV is not configured", async () => {
  await assert.rejects(
    kernel.persistRuntimeConfig({ rateLimitRpm: 20 }, { env: {} }),
    error => error?.code === "KV_NOT_CONFIGURED" && error?.status === 503
  );
});

test("applyKvMutationsWithRollback restores only mutations that completed", async () => {
  const { kv, values, kernel: kvOperations } = createKv({ first: "old-first", second: "old-second" });
  kv.put = async (key, value) => {
    kvOperations.push({ type: "put", key, value: String(value) });
    if (key === "second") throw new Error("second write failed");
    values.set(key, String(value));
  };

  await assert.rejects(
    kernel.applyKvMutationsWithRollback(kv, [
      { type: "put", key: "first", value: "new-first" },
      { type: "put", key: "second", value: "new-second" }
    ]),
    /second write failed/
  );

  assert.equal(values.get("first"), "old-first");
  assert.equal(values.get("second"), "old-second");
  assert.deepEqual(kvOperations.map(operation => operation.key), ["first", "second", "first"]);
});

test("applyKvMutationsWithRollback preserves concurrent values and reports conflicts", async () => {
  const { kv, values } = createKv({ first: "old-first", second: "old-second" });
  kv.put = async (key, value) => {
    if (key === "second") {
      values.set("first", "concurrent-first");
      throw new Error("second write failed");
    }
    values.set(key, String(value));
  };

  await assert.rejects(
    kernel.applyKvMutationsWithRollback(kv, [
      { type: "put", key: "first", value: "new-first" },
      { type: "put", key: "second", value: "new-second" }
    ]),
    error => error?.code === "KV_MUTATION_ROLLBACK_CONFLICT"
      && error?.status === 409
      && error?.details?.rollbackConflicts?.includes("first")
  );
  assert.equal(values.get("first"), "concurrent-first");
  assert.equal(values.get("second"), "old-second");
});

test("listKvKeysStrict fails closed for missing and repeated cursors", async () => {
  await assert.rejects(
    kernel.listKvKeysStrict({
      async list() {
        return { keys: [{ name: "node:a" }], list_complete: false };
      }
    }),
    error => error?.code === "KV_SCAN_INCOMPLETE" && error?.details?.reason === "missing_cursor"
  );

  let page = 0;
  await assert.rejects(
    kernel.listKvKeysStrict({
      async list() {
        page += 1;
        return { keys: [], list_complete: false, cursor: "same-cursor" };
      }
    }),
    error => error?.code === "KV_SCAN_INCOMPLETE" && error?.details?.reason === "repeated_cursor"
  );
  assert.equal(page, 2);
});

test("readRepairableRuntimeConfig fails closed when the config read fails", async () => {
  await assert.rejects(
    kernel.readRepairableRuntimeConfig({
      async get() {
        throw new Error("temporary KV outage");
      }
    }),
    error => error?.code === "KV_TIDY_CONFIG_READ_FAILED"
      && error?.status === 503
      && error?.details?.key === kernel.CONFIG_KEY
  );
});

test("KV tidy plan tokens verify signatures and reject tampering and expiry", async () => {
  const env = { JWT_SECRET: "test-tidy-secret" };
  const plan = {
    scannedKeys: ["node:a", kernel.CONFIG_KEY],
    mutationPlan: [{ type: "put", key: kernel.CONFIG_KEY, value: "{}" }],
    rebuiltNodeSummaries: [{ name: "a", target: "https://a.example" }]
  };
  plan.planHash = kernel.buildKvTidyPlanHash(plan);
  const token = await kernel.createKvTidyPlanToken(env, plan, { nowMs: 1_000, ttlMs: 60_000 });

  const payload = await kernel.verifyKvTidyPlanToken(env, token, { nowMs: 30_000 });
  assert.equal(payload.planHash, plan.planHash);

  const [payloadPart, signature] = token.split(".");
  const tamperedToken = `${payloadPart}.${signature.slice(0, -1)}${signature.endsWith("a") ? "b" : "a"}`;
  await assert.rejects(
    kernel.verifyKvTidyPlanToken(env, tamperedToken, { nowMs: 30_000 }),
    error => error?.code === "TIDY_PLAN_INVALID" && error?.status === 409
  );
  await assert.rejects(
    kernel.verifyKvTidyPlanToken(env, token, { nowMs: 61_000 }),
    error => error?.code === "TIDY_PLAN_STALE"
      && error?.details?.reason === "expired"
  );
});

test("KV tidy plan hashes bind config and snapshot revisions", () => {
  const basePlan = {
    scannedKeys: [kernel.CONFIG_KEY, kernel.CONFIG_SNAPSHOTS_KEY],
    mutationPlan: [],
    rebuiltNodeSummaries: [],
    revisions: {
      configRevision: "config-r1",
      configContentHash: "config-h1",
      snapshotsRevision: "snapshots-r1",
      snapshotsContentHash: "snapshots-h1"
    }
  };
  const previewHash = kernel.buildKvTidyPlanHash(basePlan);
  assert.notEqual(kernel.buildKvTidyPlanHash({
    ...basePlan,
    revisions: { ...basePlan.revisions, configRevision: "config-r2" }
  }), previewHash);
  assert.notEqual(kernel.buildKvTidyPlanHash({
    ...basePlan,
    revisions: { ...basePlan.revisions, snapshotsContentHash: "snapshots-h2" }
  }), previewHash);
});

test("tidyKvData rejects a signed preview when the rebuilt plan hash changes", async () => {
  const env = { JWT_SECRET: "test-tidy-secret" };
  const previewPlan = { planHash: "preview-hash" };
  const planToken = await kernel.createKvTidyPlanToken(env, previewPlan);
  const tidyOperations = { ...kernel };
  Object.assign(tidyOperations, defineKvTidyMethods({}, tidyOperations));
  tidyOperations.verifyKvTidyPlanToken = (...args) => kernel.verifyKvTidyPlanToken(...args);
  tidyOperations.buildKvTidyPlan = async () => ({ planHash: "current-hash", quotaBudget: { blocked: false } });
  tidyOperations.applyKvTidyPlan = async () => assert.fail("stale plans must not be applied");

  await assert.rejects(
    tidyOperations.tidyKvData(env, { planToken }),
    error => error?.code === "TIDY_PLAN_STALE"
      && error?.details?.reason === "plan_changed"
      && error?.details?.previewPlanHash === "preview-hash"
      && error?.details?.currentPlanHash === "current-hash"
  );
});

test("KV tidy quota includes puts, deletes, rollback writes, and rollback deletes", async () => {
  const { kv } = createKv({ existing: "old-value" });
  const budget = await kernel.resolveKvTidyQuotaBudget({}, [
    { type: "put", key: "existing", value: "new-value" },
    { type: "delete", key: "missing", value: "" }
  ], { kv, config: {} });

  assert.equal(budget.estimatedPutCount, 1);
  assert.equal(budget.estimatedDeleteCount, 1);
  assert.equal(budget.estimatedRollbackWriteCount, 1);
  assert.equal(budget.estimatedRollbackDeleteCount, 1);
  assert.equal(budget.estimatedWorstCaseWriteCount, 4);
});

test("config snapshots redact secrets and restoration preserves current secrets", async () => {
  const previousConfig = {
    rateLimitRpm: 10,
    cfApiToken: "previous-cf-secret",
    tgBotToken: "previous-tg-secret"
  };
  const currentConfig = {
    rateLimitRpm: 20,
    cfApiToken: "current-cf-secret",
    tgBotToken: "current-tg-secret"
  };
  const { kv } = createKv({
    [kernel.CONFIG_KEY]: currentConfig,
    [kernel.CONFIG_SNAPSHOTS_KEY]: []
  });
  const mutationPlan = await kernel.buildRuntimeConfigMutationPlan(
    kv,
    previousConfig,
    currentConfig,
    { reason: "test_snapshot" }
  );
  const snapshotsMutation = mutationPlan.find(mutation => mutation.key === kernel.CONFIG_SNAPSHOTS_KEY);
  const [snapshot] = JSON.parse(snapshotsMutation.value);
  assert.equal(snapshot.config.cfApiToken, undefined);
  assert.equal(snapshot.config.tgBotToken, undefined);
  await kv.put(kernel.CONFIG_SNAPSHOTS_KEY, snapshotsMutation.value);

  const env = {
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: "config-kv-safety-snapshot-restore"
  };
  invalidateRuntimeConfigCache();
  try {
    const response = await adminActions.restoreConfigSnapshot({ id: snapshot.id }, { env, ctx: null, kv });
    assert.equal(response.status, 200);
    const restored = await kv.get(kernel.CONFIG_KEY, { type: "json" });
    assert.equal(restored.rateLimitRpm, 10);
    assert.equal(restored.cfApiToken, "current-cf-secret");
    assert.equal(restored.tgBotToken, "current-tg-secret");
  } finally {
    invalidateRuntimeConfigCache();
  }
});

test("redacted settings backup roundtrip preserves current secrets", async () => {
  const currentConfig = {
    rateLimitRpm: 20,
    cfApiToken: "current-cf-secret",
    tgBotToken: "current-tg-secret"
  };
  const { kv } = createKv({ [kernel.CONFIG_KEY]: currentConfig });
  const env = {
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: "config-kv-safety-settings-roundtrip"
  };
  invalidateRuntimeConfigCache();
  try {
    const exportedResponse = await adminActions.exportSettings({}, {
      env,
      request: new Request("https://worker.test/admin")
    });
    const backup = await exportedResponse.json();
    assert.equal(backup.secretsRedacted, true);
    assert.equal(backup.config.cfApiToken, undefined);
    assert.equal(backup.config.tgBotToken, undefined);

    await adminActions.importSettings(backup, { env, ctx: null, kv, meta: {} });
    const restored = await kv.get(kernel.CONFIG_KEY, { type: "json" });
    assert.equal(restored.cfApiToken, "current-cf-secret");
    assert.equal(restored.tgBotToken, "current-tg-secret");
  } finally {
    invalidateRuntimeConfigCache();
  }
});

test("full backup export rejects payloads that cannot fit the import request limit", async () => {
  const { kv } = createKv({ [kernel.CONFIG_KEY]: { rateLimitRpm: 30 } });
  const env = {
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: "config-kv-safety-full-export-limit"
  };
  const originalLoadAllNodeEntitiesFromKvStrict = kernel.loadAllNodeEntitiesFromKvStrict;
  kernel.loadAllNodeEntitiesFromKvStrict = async () => [{
    name: "oversized",
    target: "https://origin.test",
    remark: "x".repeat(12 * 1024 * 1024)
  }];
  invalidateRuntimeConfigCache();

  try {
    const response = await adminActions.exportConfig({}, {
      env,
      ctx: null,
      request: new Request("https://worker.test/admin")
    });
    const payload = await response.json();
    assert.equal(response.status, 413);
    assert.equal(payload.error.code, "FULL_BACKUP_TOO_LARGE");
    assert.ok(payload.error.details.importRequestBytes > payload.error.details.maxBytes);
    assert.equal(payload.error.details.nodeCount, 1);
  } finally {
    kernel.loadAllNodeEntitiesFromKvStrict = originalLoadAllNodeEntitiesFromKvStrict;
    invalidateRuntimeConfigCache();
  }
});

test("Worker HTML rollback preserves settings saved after activation", async () => {
  const previousIndex = await buildAdminLocalIndexUploadRecord(
    '<!doctype html><html><body><div id="app">previous</div></body></html>',
    "index.html"
  );
  const activatedIndex = await buildAdminLocalIndexUploadRecord(
    '<!doctype html><html><body><div id="app">activated</div></body></html>',
    "index.html"
  );
  const previousConfig = { uiRadiusPx: 8, indexUrl: previousIndex.sourceUrl };
  const activatedConfig = { uiRadiusPx: 8, indexUrl: activatedIndex.sourceUrl };
  const concurrentlySavedConfig = { uiRadiusPx: 33, indexUrl: activatedIndex.sourceUrl };
  const { kv } = createKv({
    [kernel.CONFIG_KEY]: concurrentlySavedConfig,
    [kernel.buildAdminIndexUploadKey(previousIndex.revision)]: previousIndex,
    [kernel.buildAdminIndexUploadKey(activatedIndex.revision)]: activatedIndex
  });
  const env = {
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: "config-kv-safety-worker-html-rollback"
  };
  invalidateRuntimeConfigCache();

  try {
    const rollback = await kernel.rollbackAdminIndexUploadActivation(
      previousConfig,
      activatedConfig,
      { env, kv, ctx: null }
    );
    const finalConfig = await kv.get(kernel.CONFIG_KEY, { type: "json" });
    assert.equal(rollback.skipped, false);
    assert.equal(finalConfig.uiRadiusPx, 33);
    assert.equal(finalConfig.indexUrl, previousIndex.sourceUrl);
  } finally {
    invalidateRuntimeConfigCache();
  }
});

test("local HTML activation retains only versions referenced by config and snapshots", async () => {
  const { kv, values } = createKv({ [kernel.CONFIG_KEY]: {} });
  const env = {
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: "config-kv-safety-admin-index-retention"
  };
  invalidateRuntimeConfigCache();

  try {
    for (let index = 0; index < 8; index += 1) {
      const record = await buildAdminLocalIndexUploadRecord(
        `<!doctype html><html><body><div id="app">version-${index}</div></body></html>`,
        "index.html"
      );
      await kernel.persistAdminIndexUpload(record, { env, kv, ctx: null });
    }

    const config = await kv.get(kernel.CONFIG_KEY, { type: "json" });
    const snapshots = await kernel.getConfigSnapshotsForRead(kv, { withConfig: true });
    const referencedRevisions = kernel.collectReferencedAdminIndexUploadRevisions(config, snapshots);
    const storedUploadKeys = [...values.keys()]
      .filter(key => key.startsWith(kernel.ADMIN_INDEX_UPLOAD_PREFIX));
    assert.equal(snapshots.length, 5);
    assert.equal(referencedRevisions.size, 6);
    assert.equal(storedUploadKeys.length, 6);
    assert.deepEqual(
      new Set(storedUploadKeys),
      new Set([...referencedRevisions].map(revision => kernel.buildAdminIndexUploadKey(revision)))
    );
  } finally {
    invalidateRuntimeConfigCache();
  }
});

test("stale device settings saves preserve the server-managed admin index", async () => {
  const record = await buildAdminLocalIndexUploadRecord(
    '<!doctype html><html><body><div id="app">active-admin</div></body></html>',
    "index.html"
  );
  const uploadKey = kernel.buildAdminIndexUploadKey(record.revision);
  const { kv } = createKv({
    [kernel.CONFIG_KEY]: { indexUrl: record.sourceUrl, rateLimitRpm: 10 },
    [kernel.CONFIG_SNAPSHOTS_KEY]: [],
    [uploadKey]: record
  });
  const env = {
    ADMIN_PATH: "/ADMIN",
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: "stale-device-admin-index"
  };
  invalidateRuntimeConfigCache();

  try {
    await kernel.persistAdminIndexUpload(record, { env, kv, ctx: null });
    const response = await adminActions.saveConfig({
      config: { rateLimitRpm: 99 }
    }, { env, kv, ctx: null, meta: { section: "security", source: "stale-device" } });
    const payload = await response.json();
    const storedConfig = await kv.get(kernel.CONFIG_KEY, { type: "json" });
    const activeRecord = await kernel.getAdminActiveIndexRecord(kv);

    assert.equal(response.status, 200);
    assert.equal(payload.config.indexUrl, record.sourceUrl);
    assert.equal(storedConfig.indexUrl, record.sourceUrl);
    assert.equal(storedConfig.rateLimitRpm, 99);
    assert.equal(activeRecord.revision, record.revision);
  } finally {
    invalidateRuntimeConfigCache();
  }
});

test("stale config revisions are rejected before settings persistence", async () => {
  const { kv } = createKv({
    [kernel.CONFIG_KEY]: { rateLimitRpm: 20 },
    [kernel.CONFIG_SNAPSHOTS_KEY]: []
  });
  const env = {
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: "stale-config-revision"
  };
  invalidateRuntimeConfigCache();

  try {
    await assert.rejects(
      adminActions.saveConfig({
        config: { rateLimitRpm: 30 },
        expectedConfigRevision: "2026-01-01T00:00:00.000Z.stale"
      }, { env, kv, ctx: null, meta: {} }),
      error => error?.code === "CONFIG_REVISION_CONFLICT" && error?.status === 409
    );
    assert.equal((await kv.get(kernel.CONFIG_KEY, { type: "json" })).rateLimitRpm, 20);
  } finally {
    invalidateRuntimeConfigCache();
  }
});

test("active admin index renders when a remote PoP still sees stale config", async () => {
  const record = await buildAdminLocalIndexUploadRecord(
    '<!doctype html><html><body><div id="app">active-from-envelope</div></body></html>',
    "index.html"
  );
  const { kv } = createKv({
    [kernel.CONFIG_KEY]: {},
    [kernel.CONFIG_SNAPSHOTS_KEY]: []
  });
  const env = {
    ADMIN_PATH: "/ADMIN",
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: "active-index-stale-config"
  };
  invalidateRuntimeConfigCache();

  try {
    await kernel.persistAdminIndexUpload(record, { env, kv, ctx: null });
    const response = await adminShell.renderAdminPage(
      new Request("https://worker.test/ADMIN", { headers: { Accept: "text/html" } }),
      env,
      null,
      { ok: true, missing: [] },
      {}
    );
    const rendered = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
    assert.equal(response.headers.get("X-Admin-Shell-Revision"), record.revision);
    assert.match(rendered, /active-from-envelope/);
    assert.doesNotMatch(rendered, /admin-gate-shell/);
  } finally {
    invalidateRuntimeConfigCache();
  }
});

test("KV tidy removes orphaned local HTML records and preserves referenced versions", async () => {
  const referencedIndex = await buildAdminLocalIndexUploadRecord(
    '<!doctype html><html><body><div id="app">referenced</div></body></html>',
    "index.html"
  );
  const orphanedIndex = await buildAdminLocalIndexUploadRecord(
    '<!doctype html><html><body><div id="app">orphaned</div></body></html>',
    "index.html"
  );
  const referencedKey = kernel.buildAdminIndexUploadKey(referencedIndex.revision);
  const orphanedKey = kernel.buildAdminIndexUploadKey(orphanedIndex.revision);
  const { kv } = createKv({
    [kernel.CONFIG_KEY]: { indexUrl: referencedIndex.sourceUrl },
    [referencedKey]: referencedIndex,
    [orphanedKey]: orphanedIndex
  });
  const env = {
    ENI_KV: kv,
    JWT_SECRET: "tidy-admin-index-secret",
    __CONFIG_CACHE_NAMESPACE: "config-kv-safety-admin-index-tidy"
  };
  invalidateRuntimeConfigCache();

  try {
    const plan = await kernel.buildKvTidyPlan(env, { kv });
    const deletedKeys = plan.mutationPlan
      .filter(mutation => mutation.type === "delete")
      .map(mutation => mutation.key);
    const uploadDeleteGroup = plan.preview.deleteGroups.find(group => group.key === "admin_index_uploads");
    assert.ok(deletedKeys.includes(orphanedKey));
    assert.ok(!deletedKeys.includes(referencedKey));
    assert.equal(plan.summary.deletedAdminIndexUploadCount, 1);
    assert.equal(uploadDeleteGroup?.count, 1);
    assert.deepEqual(uploadDeleteGroup?.samples, [orphanedKey]);
  } finally {
    invalidateRuntimeConfigCache();
  }
});

test("full import keeps a competing config save queued until rollback completes", async () => {
  const currentConfig = {
    rateLimitRpm: 10,
    cfApiToken: "current-cf-secret",
    tgBotToken: "current-tg-secret"
  };
  const { kv } = createKv({
    [kernel.CONFIG_KEY]: currentConfig,
    [`${kernel.PREFIX}alpha`]: {
      target: "https://origin.test",
      entryMode: "kv_route"
    }
  });
  const env = {
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: "config-kv-safety-full-import-chain"
  };
  const nodeMutationStarted = createDeferred();
  const releaseNodeMutation = createDeferred();
  const originalApplyPreparedNodeMutations = kernel.applyPreparedNodeMutations;
  kernel.applyPreparedNodeMutations = async () => {
    nodeMutationStarted.resolve();
    await releaseNodeMutation.promise;
    throw new Error("node_mutation_failed");
  };
  invalidateRuntimeConfigCache();

  try {
    const importPromise = adminActions.importFull({
      config: { ...currentConfig, rateLimitRpm: 20 },
      nodes: [{
        name: "alpha",
        target: "https://imported-origin.test",
        entryMode: "kv_route"
      }]
    }, { env, ctx: null, kv });
    await nodeMutationStarted.promise;

    let competingSaveSettled = false;
    const competingSave = kernel.persistRuntimeConfig({
      ...currentConfig,
      rateLimitRpm: 30
    }, { env, kv, ctx: null }).finally(() => {
      competingSaveSettled = true;
    });
    await Promise.resolve();
    assert.equal(competingSaveSettled, false);

    releaseNodeMutation.resolve();
    await assert.rejects(importPromise, /node_mutation_failed/);
    await competingSave;

    const finalConfig = await kv.get(kernel.CONFIG_KEY, { type: "json" });
    assert.equal(finalConfig.rateLimitRpm, 30);
    assert.equal(finalConfig.cfApiToken, "current-cf-secret");
    assert.equal(finalConfig.tgBotToken, "current-tg-secret");
  } finally {
    releaseNodeMutation.resolve();
    kernel.applyPreparedNodeMutations = originalApplyPreparedNodeMutations;
    invalidateRuntimeConfigCache();
  }
});

test("full import keeps a competing node save queued and the later node value wins", async () => {
  const currentConfig = { rateLimitRpm: 10 };
  const { kv } = createKv({
    [kernel.CONFIG_KEY]: currentConfig,
    [`${kernel.PREFIX}alpha`]: {
      target: "https://old-origin.test",
      entryMode: "kv_route"
    }
  });
  const env = {
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: "config-kv-safety-full-import-node-chain"
  };
  const indexRebuildStarted = createDeferred();
  const releaseIndexRebuild = createDeferred();
  const originalRebuildNodeIndexesFromKv = kernel.rebuildNodeIndexesFromKv;
  let indexRebuildCallCount = 0;
  kernel.rebuildNodeIndexesFromKv = async (...args) => {
    indexRebuildCallCount += 1;
    if (indexRebuildCallCount === 1) {
      indexRebuildStarted.resolve();
      await releaseIndexRebuild.promise;
      throw new Error("import_node_index_rebuild_failed");
    }
    return await originalRebuildNodeIndexesFromKv.apply(kernel, args);
  };
  invalidateRuntimeConfigCache();

  try {
    const importPromise = adminActions.importFull({
      config: { rateLimitRpm: 20 },
      nodes: [{
        name: "alpha",
        target: "https://imported-origin.test",
        entryMode: "kv_route"
      }]
    }, { env, ctx: null, kv });
    await indexRebuildStarted.promise;

    const importedNode = await kv.get(`${kernel.PREFIX}alpha`, { type: "json" });
    assert.equal(importedNode.target, "https://imported-origin.test:443");

    let competingSaveSettled = false;
    const competingSave = adminActions.saveOrImport({
      name: "alpha",
      originalName: "alpha",
      target: "https://concurrent-origin.test",
      entryMode: "kv_route"
    }, { action: "save", env, ctx: null, kv }).finally(() => {
      competingSaveSettled = true;
    });
    await Promise.resolve();
    assert.equal(competingSaveSettled, false);

    releaseIndexRebuild.resolve();
    await assert.rejects(importPromise, /import_node_index_rebuild_failed/);
    const competingResponse = await competingSave;
    assert.equal(competingResponse.status, 200);

    const finalConfig = await kv.get(kernel.CONFIG_KEY, { type: "json" });
    const finalNode = await kv.get(`${kernel.PREFIX}alpha`, { type: "json" });
    assert.equal(finalConfig.rateLimitRpm, 10);
    assert.equal(finalNode.target, "https://concurrent-origin.test:443");
  } finally {
    releaseIndexRebuild.resolve();
    kernel.rebuildNodeIndexesFromKv = originalRebuildNodeIndexesFromKv;
    invalidateRuntimeConfigCache();
  }
});

test("settings import honors an explicitly cleared secret", async () => {
  const { kv } = createKv({
    [kernel.CONFIG_KEY]: {
      cfApiToken: "current-cf-secret",
      tgBotToken: "current-tg-secret"
    }
  });
  const env = {
    ENI_KV: kv,
    __CONFIG_CACHE_NAMESPACE: "config-kv-safety-explicit-clear"
  };
  invalidateRuntimeConfigCache();
  try {
    await adminActions.importSettings({
      config: { cfApiToken: "", tgBotToken: "replacement-tg-secret" }
    }, { env, ctx: null, kv, meta: {} });
    const restored = await kv.get(kernel.CONFIG_KEY, { type: "json" });
    assert.equal(restored.cfApiToken, "");
    assert.equal(restored.tgBotToken, "replacement-tg-secret");
  } finally {
    invalidateRuntimeConfigCache();
  }
});

test("config and DNS restoration still restores raw KV when DNS compensation fails", async () => {
  const snapshotOperations = { ...kernel };
  Object.assign(snapshotOperations, defineSnapshotMethods({}, snapshotOperations));
  let rawStateRestored = false;
  snapshotOperations.commitRuntimeConfig = async () => {
    throw new Error("dns_restore_failed");
  };
  snapshotOperations.restoreCapturedRuntimeConfigState = async () => {
    rawStateRestored = true;
    return { rateLimitRpm: 10 };
  };

  await assert.rejects(
    snapshotOperations.restoreCapturedRuntimeConfigAndDnsState({ config: { rateLimitRpm: 10 } }, {}),
    error => error?.code === "CONFIG_DNS_RESTORE_FAILED"
      && error?.details?.dnsRestoreError === "dns_restore_failed"
      && error?.details?.kvRestoreError === ""
  );
  assert.equal(rawStateRestored, true);
});
