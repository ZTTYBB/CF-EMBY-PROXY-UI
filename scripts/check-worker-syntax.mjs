import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const workerRoot = path.join(repositoryRoot, 'worker');

async function listJavaScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listJavaScriptFiles(target) : (entry.isFile() && entry.name.endsWith('.js') ? [target] : []);
  }));
  return nested.flat().sort();
}

const files = await listJavaScriptFiles(workerRoot);
for (const file of files) {
  const source = await fs.readFile(file, 'utf8');
  const trailingWhitespace = /[ \t]+$/m.exec(source);
  if (trailingWhitespace) {
    const line = source.slice(0, trailingWhitespace.index).split(/\r?\n/).length;
    console.error(`[check-worker-syntax] trailing whitespace in ${path.relative(repositoryRoot, file)}:${line}`);
    process.exit(1);
  }
  const completed = spawnSync(process.execPath, ['--check', file], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: false
  });
  if (completed.error) throw completed.error;
  if (completed.status !== 0) process.exit(completed.status || 1);
}

console.log(`[check-worker-syntax] checked ${files.length} modules`);
