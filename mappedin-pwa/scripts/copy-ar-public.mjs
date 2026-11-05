import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pwaRoot = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(pwaRoot, '../ar-nav');
const destination = path.join(pwaRoot, 'public/ar');

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, {
  recursive: true,
  filter: (entry) => path.basename(entry) !== '.netlify',
});
console.log('Copied AR assets to public/ar (excluding .netlify).');
