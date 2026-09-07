import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));

if (manifest.manifest_version !== 3) throw new Error('manifest_version must be 3');
if (!manifest.name || !manifest.version) throw new Error('manifest name/version are required');
if (pkg.version !== manifest.version) throw new Error('package.json version must match manifest version');
if (lock.version !== manifest.version || lock.packages?.['']?.version !== manifest.version) {
  throw new Error('package-lock.json version must match manifest version');
}

const referencedFiles = [
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  manifest.options_page,
  ...(manifest.content_scripts || []).flatMap((entry) => [...(entry.js || []), ...(entry.css || [])])
].filter(Boolean);

for (const file of referencedFiles) {
  await access(resolve(root, file));
}

const popupHtml = await readFile(resolve(root, manifest.action.default_popup), 'utf8');
const optionsHtml = await readFile(resolve(root, manifest.options_page), 'utf8');
if (!popupHtml.includes('id="version"')) throw new Error('popup must expose a visible version element');
if (!optionsHtml.includes('id="version"')) throw new Error('options page must expose a visible version element');

console.log(`Manifest ${manifest.version} is valid; versions align and ${referencedFiles.length} referenced files exist.`);
