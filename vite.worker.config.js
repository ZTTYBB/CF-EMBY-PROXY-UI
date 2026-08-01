import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    target: 'es2022',
    outDir: path.join(repositoryRoot, '.worker-dist'),
    emptyOutDir: true,
    copyPublicDir: false,
    minify: 'esbuild',
    sourcemap: false,
    lib: {
      entry: path.join(repositoryRoot, 'worker', 'index.js'),
      formats: ['es'],
      fileName: () => 'worker.js'
    },
    rolldownOptions: {
      output: {
        codeSplitting: false,
        entryFileNames: 'worker.js',
        banner: '// GENERATED FILE. Edit worker/ ESM sources and run npm run build:worker.'
      }
    }
  }
});
