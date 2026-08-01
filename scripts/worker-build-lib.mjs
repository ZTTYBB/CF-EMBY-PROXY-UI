import { build } from 'vite';
import { fileURLToPath } from 'node:url';

export const MAX_WORKER_BUNDLE_BYTES = 950_000;

/**
 * Build the Worker and enforce its single-module delivery contract.
 *
 * @param {{ outDir: string, write?: boolean }} options
 */
export async function buildWorkerBundle({ outDir, write = true }) {
  const result = await build({
    configFile: fileURLToPath(new URL('../vite.worker.config.js', import.meta.url)),
    build: {
      outDir,
      emptyOutDir: true,
      write
    }
  });
  const outputs = Array.isArray(result) ? result : [result];
  const emitted = outputs.flatMap(output => output?.output || []);
  const chunks = emitted.filter(item => item.type === 'chunk');
  const assets = emitted.filter(item => item.type === 'asset' && !String(item.fileName).endsWith('.map'));

  if (chunks.length !== 1 || chunks[0].isEntry !== true) {
    throw new Error(`Worker build must emit exactly one entry chunk; received ${chunks.length}`);
  }
  if (chunks[0].imports.length || chunks[0].dynamicImports.length) {
    throw new Error('Worker bundle must not contain static or dynamic external chunk imports');
  }
  if (assets.length) {
    throw new Error(`Worker build emitted unsupported assets: ${assets.map(item => item.fileName).join(', ')}`);
  }
  const bundleBytes = Buffer.byteLength(chunks[0].code, 'utf8');
  if (bundleBytes > MAX_WORKER_BUNDLE_BYTES) {
    throw new Error(`Worker bundle exceeds ${MAX_WORKER_BUNDLE_BYTES} byte budget; received ${bundleBytes}`);
  }
  console.log(`[worker-build] worker.js ${bundleBytes} bytes (budget ${MAX_WORKER_BUNDLE_BYTES})`);
  return chunks[0];
}
