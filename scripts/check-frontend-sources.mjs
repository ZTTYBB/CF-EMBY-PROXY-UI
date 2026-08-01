import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const frontendDirectory = path.join(repositoryRoot, 'frontend');
const sourceDirectory = path.join(frontendDirectory, 'src');
const frontendRequire = createRequire(path.join(frontendDirectory, 'package.json'));
const { compileScript, parse } = frontendRequire('@vue/compiler-sfc');

async function findVueFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return findVueFiles(target);
    return entry.isFile() && entry.name.endsWith('.vue') ? [target] : [];
  }));
  return nestedFiles.flat();
}

const vueFiles = await findVueFiles(sourceDirectory);
for (const filePath of vueFiles) {
  const source = await readFile(filePath, 'utf8');
  const parsed = parse(source, { filename: filePath });
  if (parsed.errors.length) {
    const details = parsed.errors.map((error) => error?.message || String(error)).join('\n');
    throw new Error(`${path.relative(repositoryRoot, filePath)}: ${details}`);
  }
  if (parsed.descriptor.scriptSetup) {
    compileScript(parsed.descriptor, { id: path.relative(sourceDirectory, filePath) });
  }
}

console.log(`[check-frontend-sources] ${vueFiles.length} Vue SFC files compiled successfully`);
