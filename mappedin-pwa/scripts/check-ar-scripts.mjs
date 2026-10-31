import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../ar-nav');
function scripts(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.netlify', '.git'].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? scripts(path) : extname(path) === '.js' ? [path] : [];
  });
}
// These classic scripts are copied as static assets; tsc/Vite do not parse them.
const files = scripts(root);
for (const path of files) new Script(readFileSync(path, 'utf8'), { filename: path });
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) {
  const src = match[1].split(/[?#]/)[0];
  if (!src.startsWith('./')) continue;
  const path = resolve(root, src);
  if (!statSync(path).isFile()) throw new Error(`Missing AR script: ${src}`);
}
console.log(`AR syntax check passed: ${files.length} scripts and index script references.`);
