import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));

if (manifest.manifest_version !== 3) throw new Error('manifest_version must be 3');
if (!manifest.name || !manifest.version) throw new Error('manifest name/version are required');

const referencedFiles = [
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  manifest.options_page,
  ...(manifest.content_scripts || []).flatMap((entry) => [...(entry.js || []), ...(entry.css || [])])
].filter(Boolean);

for (const file of referencedFiles) {
  await access(resolve(root, file));
}

console.log(`Manifest ${manifest.version} is valid; ${referencedFiles.length} referenced files exist.`);
