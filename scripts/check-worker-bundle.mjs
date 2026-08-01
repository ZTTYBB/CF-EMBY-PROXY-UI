import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_WORKER_BUNDLE_BYTES, buildWorkerBundle } from './worker-build-lib.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-emby-worker-check-'));

try {
  await buildWorkerBundle({ outDir: temporaryDirectory });
  const [expected, actual] = await Promise.all([
    fs.readFile(path.join(temporaryDirectory, 'worker.js')),
    fs.readFile(path.join(repositoryRoot, 'worker.js'))
  ]);
  if (!expected.equals(actual)) {
    throw new Error('worker.js is stale; run npm run build:worker and commit the generated artifact');
  }
  if (actual.byteLength > MAX_WORKER_BUNDLE_BYTES) {
    throw new Error(`worker.js exceeds ${MAX_WORKER_BUNDLE_BYTES} byte budget; received ${actual.byteLength}`);
  }
  console.log(`[check-worker-bundle] worker.js is current (${actual.byteLength} bytes)`);
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
