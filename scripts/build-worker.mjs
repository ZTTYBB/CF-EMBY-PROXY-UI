import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWorkerBundle } from './worker-build-lib.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(repositoryRoot, '.worker-dist');
const builtWorkerPath = path.join(outputDirectory, 'worker.js');
const releaseWorkerPath = path.join(repositoryRoot, 'worker.js');
const temporaryWorkerPath = path.join(repositoryRoot, '.worker.js.tmp');

await buildWorkerBundle({ outDir: outputDirectory });
await fs.copyFile(builtWorkerPath, temporaryWorkerPath);
await fs.rename(temporaryWorkerPath, releaseWorkerPath);
console.log(`[build-worker] wrote ${releaseWorkerPath}`);
