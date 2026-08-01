import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createTestApplication } from "../worker/testing/hooks.js";

const { testPlatform } = createTestApplication();
const kernel = testPlatform.d1;

const CURRENT_TABLES = [
  "sys_status",
  "sys_locks",
  "auth_failures",
  "cf_dashboard_cache",
  "cf_runtime_cache",
  "dns_ip_pool_items",
  "dns_ip_pool_sources",
  "dns_ip_pool_fetch_cache",
  "dns_ip_probe_cache",
  "proxy_logs",
  "proxy_stats_hourly",
  "proxy_logs_fts"
];

const RETIRED_TABLES = [
  ["d1", "migrations"].join("_"),
  ["server", "last", "watch"].join("_"),
  ["server", "record", "snapshots"].join("_"),
  ["server", "record", "poster", "cache"].join("_")
];

function createD1Adapter(database, options = {}) {
  let batchTail = Promise.resolve();
  const events = options.events || [];
  const adapter = {
    prepare(sql) {
      const sqlText = String(sql);
      const statement = database.prepare(sqlText);
      let bindings = [];
      const prepared = {
        bind(...values) {
          bindings = values;
          return prepared;
        },
        async run() {
          events.push({ type: "run", sql: sqlText });
          return statement.run(...bindings);
        },
        async all() {
          return { results: statement.all(...bindings) };
        },
        async first() {
          return statement.get(...bindings) || null;
        }
      };
      return prepared;
    },
    batch(statements) {
      const task = batchTail.then(async () => {
        database.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          database.exec("COMMIT");
          return results;
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
      batchTail = task.catch(() => {});
      return task;
    }
  };
  return adapter;
}

function getTableNames(database) {
  return new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
}

async function withDatabase(callback, options = {}) {
  const database = new DatabaseSync(":memory:");
  try {
    return await callback(database, createD1Adapter(database, options));
  } finally {
    database.close();
  }
}

test("empty D1 initializes the current schema directly", async () => {
  const events = [];
  await withDatabase(async (database, db) => {
    const result = await kernel.initializeD1Database(db, { includeFts: true });
    const status = await kernel.getD1SchemaStatus(db);
    const tables = getTableNames(database);

    assert.equal(result.schemaReady, true);
    assert.deepEqual(Object.keys(result).sort(), [
      "createdTables",
      "ftsRebuilt",
      "ftsRecreated",
      "profile",
      "schemaReady",
      "status",
      "steps"
    ]);
    assert.equal(status.schemaReady, true);
    for (const tableName of CURRENT_TABLES) assert.equal(tables.has(tableName), true, tableName);
    for (const tableName of RETIRED_TABLES) assert.equal(tables.has(tableName), false, tableName);

    const firstSchemaWrite = events.findIndex(event => /^(?:CREATE|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(String(event.sql || "").trim()));
    assert.ok(firstSchemaWrite >= 0);
  }, { events });
});

test("repeated current-schema initialization is idempotent", async () => {
  await withDatabase(async (database, db) => {
    const first = await kernel.initializeD1Database(db, { includeFts: true });
    const tablesAfterFirst = [...getTableNames(database)].sort();
    const second = await kernel.initializeD1Database(db, { includeFts: true });

    assert.equal(first.schemaReady, true);
    assert.equal(second.schemaReady, true);
    assert.deepEqual([...getTableNames(database)].sort(), tablesAfterFirst);
    assert.deepEqual(second.createdTables, []);
  });
});

test("an incompatible existing table fails before schema writes", async () => {
  const events = [];
  await withDatabase(async (database, db) => {
    database.exec("CREATE TABLE proxy_logs (id TEXT PRIMARY KEY)");
    events.length = 0;

    await assert.rejects(
      kernel.initializeD1Database(db, { includeFts: true }),
      error => error?.code === "D1_SCHEMA_INCOMPATIBLE" && error?.details?.phase === "preflight"
    );
    assert.equal(events.some(event => /^(?:CREATE|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(String(event.sql || "").trim())), false);
    assert.deepEqual(database.prepare("PRAGMA table_info(proxy_logs)").all().map(row => row.name), ["id"]);
  }, { events });
});

test("wrong primary and unique key contracts fail without repair", async t => {
  await t.test("primary key", async () => {
    await withDatabase(async (database, db) => {
      database.exec("CREATE TABLE sys_status (scope TEXT, payload TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL DEFAULT 0)");
      await assert.rejects(
        kernel.initializeD1Database(db, { includeFts: true }),
        error => error?.code === "D1_SCHEMA_INCOMPATIBLE" && error?.details?.issues?.includes("invalid_primary_key:sys_status")
      );
    });
  });

  await t.test("unique key", async () => {
    await withDatabase(async (database, db) => {
      database.exec(`CREATE TABLE dns_ip_pool_items (
        id TEXT PRIMARY KEY,
        ip TEXT NOT NULL,
        ip_type TEXT NOT NULL DEFAULT '',
        source_kind TEXT NOT NULL DEFAULT '',
        source_label TEXT,
        line_label TEXT NOT NULL DEFAULT '',
        remark TEXT,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      )`);
      await assert.rejects(
        kernel.initializeD1Database(db, { includeFts: true }),
        error => error?.code === "D1_SCHEMA_INCOMPATIBLE" && error?.details?.issues?.includes("missing_unique_key:dns_ip_pool_items.ip")
      );
    });
  });
});

test("wrong column types and existing index definitions fail before writes", async t => {
  await t.test("column type", async () => {
    const events = [];
    await withDatabase(async (database, db) => {
      database.exec("CREATE TABLE sys_status (scope TEXT PRIMARY KEY, payload INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)");
      events.length = 0;
      await assert.rejects(
        kernel.initializeD1Database(db, { includeFts: true }),
        error => error?.code === "D1_SCHEMA_INCOMPATIBLE" && error?.details?.issues?.includes("invalid_column_type:sys_status.payload")
      );
      assert.equal(events.some(event => /^(?:CREATE|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(String(event.sql || "").trim())), false);
    }, { events });
  });

  await t.test("index columns", async () => {
    const events = [];
    await withDatabase(async (database, db) => {
      await kernel.initializeD1Database(db, { includeFts: true });
      database.exec("DROP INDEX idx_proxy_logs_category_time");
      database.exec("CREATE INDEX idx_proxy_logs_category_time ON proxy_logs (node_name)");
      events.length = 0;
      await assert.rejects(
        kernel.initializeD1Database(db, { includeFts: true }),
        error => error?.code === "D1_SCHEMA_INCOMPATIBLE" && error?.details?.issues?.includes("invalid_index:idx_proxy_logs_category_time")
      );
      assert.equal(events.some(event => /^(?:CREATE|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(String(event.sql || "").trim())), false);
    }, { events });
  });
});

test("extra legacy tables remain untouched and do not affect readiness", async () => {
  await withDatabase(async (database, db) => {
    database.exec("CREATE TABLE legacy_unused (id INTEGER PRIMARY KEY, payload TEXT)");
    database.exec("INSERT INTO legacy_unused (payload) VALUES ('preserved')");

    const result = await kernel.initializeD1Database(db, { includeFts: true });
    assert.equal(result.schemaReady, true);
    assert.equal(database.prepare("SELECT payload FROM legacy_unused").get().payload, "preserved");
    assert.equal(getTableNames(database).has("legacy_unused"), true);
  });
});

test("schema status exposes only current contract fields", async () => {
  await withDatabase(async (_database, db) => {
    await kernel.initializeD1Database(db, { includeFts: true });
    const status = await kernel.getD1SchemaStatus(db);

    assert.deepEqual(Object.keys(status).sort(), [
      "columns",
      "constraints",
      "fts",
      "ftsReady",
      "indexes",
      "issues",
      "schemaReady",
      "tables"
    ]);
    assert.equal(status.schemaReady, true);
    for (const key of ["migrationReady", "runtimeCompatibilityReady", "appliedMigrations", "missingMigrations", "schemaVersion"]) {
      assert.equal(Object.hasOwn(status, key), false, key);
    }
  });
});

test("current logs, statistics, DNS, status, cache, lock, auth, and FTS structures accept data", async () => {
  await withDatabase(async (database, db) => {
    await kernel.initializeD1Database(db, { includeFts: true });
    database.exec(`
      INSERT INTO sys_status (scope, payload, updated_at) VALUES ('runtime', '{}', 1);
      INSERT INTO sys_locks (scope, token, owner, acquired_at, expires_at) VALUES ('tidy', 'token', 'test', 1, 2);
      INSERT INTO auth_failures (ip, fail_count, expires_at, updated_at) VALUES ('203.0.113.1', 1, 2, 1);
      INSERT INTO cf_dashboard_cache (cache_key, zone_id, bucket_date, payload, version, cached_at, expires_at, updated_at) VALUES ('dash', 'zone', '2026-07-31', '{}', 1, 1, 2, 1);
      INSERT INTO cf_runtime_cache (cache_key, cache_group, resource_id, payload, cached_at, expires_at, updated_at) VALUES ('runtime', 'quota', 'id', '{}', 1, 2, 1);
      INSERT INTO dns_ip_pool_items (id, ip, ip_type, source_kind, line_label, created_at, updated_at) VALUES ('ip-1', '203.0.113.2', 'IPv4', 'manual', '', 'now', 'now');
      INSERT INTO dns_ip_pool_sources (id, name, url, source_type, source_kind, enabled, sort_order, ip_limit, created_at, updated_at) VALUES ('source-1', 'source', 'https://example.test/ips', 'url', 'custom', 1, 0, 5, 'now', 'now');
      INSERT INTO dns_ip_pool_fetch_cache (signature, items_json, source_results_json, imported_count, enabled_source_count, cached_at, expires_at, created_at, updated_at) VALUES ('sig', '[]', '[]', 0, 1, 1, 2, 'now', 'now');
      INSERT INTO dns_ip_probe_cache (ip, entry_colo, probe_status, probed_at, expires_at) VALUES ('203.0.113.2', 'SJC', 'ok', 'now', 2);
      INSERT INTO proxy_logs (timestamp, node_name, request_path, request_method, status_code, response_time, client_ip, category, created_at) VALUES (1, 'alpha', '/Items', 'GET', 200, 5, '203.0.113.3', 'api', 'now');
      INSERT INTO proxy_stats_hourly (bucket_date, bucket_hour, request_count, play_count, playback_info_count, updated_at) VALUES ('2026-07-31', 12, 1, 0, 0, 'now');
    `);

    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM proxy_logs").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM proxy_stats_hourly").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM proxy_logs_fts WHERE proxy_logs_fts MATCH 'alpha'").get().count, 1);
    assert.equal((await kernel.getD1SchemaStatus(db)).schemaReady, true);
  });
});

test("scheduled D1 tidy operates on the current schema", async () => {
  await withDatabase(async (_database, db) => {
    await kernel.initializeD1Database(db, { includeFts: true });
    const result = await kernel.tidyD1Data({ DB: db }, {
      db,
      mode: "scheduled",
      maintenanceMode: "light",
      config: { logRetentionDays: 7 },
      nowMs: Date.now()
    });

    assert.match(String(result?.summary?.status || ""), /^(?:success|skipped)$/);
    assert.equal((await kernel.getD1SchemaStatus(db)).schemaReady, true);
  });
});
