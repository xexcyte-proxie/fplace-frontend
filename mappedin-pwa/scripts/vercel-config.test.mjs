import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

const pwaRoot = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), 'fplaces-vercel-config-'));
const compiledConfig = path.join(temporary, 'vercel-temp.mjs');
copyFileSync(path.join(pwaRoot, 'vercel.mjs'), compiledConfig);
after(() => rmSync(temporary, { recursive: true, force: true }));

function load(cwd, overrides = {}) {
  const env = { ...process.env };
  delete env.VITE_API_URL;
  delete env.VITE_API_PROXY;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { config } from ${JSON.stringify(pathToFileURL(compiledConfig).href)}; console.log(JSON.stringify(config));`,
  ], { cwd, env: { ...env, ...overrides }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

for (const cwd of [path.resolve(pwaRoot, '..'), pwaRoot]) {
  test(`relocated config reads production defaults from ${path.basename(cwd)}`, () => {
    const config = load(cwd);
    assert.equal(config.rewrites[0].source, '/api/:path*');
    assert.match(config.rewrites[0].destination, /^https?:\/\/.+\/api\/:path\*$/);
  });
}

test('hosting environment overrides production defaults', () => {
  const config = load(pwaRoot, { VITE_API_URL: 'https://override.example.com', VITE_API_PROXY: '1' });
  assert.equal(config.rewrites[0].destination, 'https://override.example.com/api/:path*');
});

test('hosting environment works without any production env file', () => {
  const config = load(temporary, { VITE_API_URL: 'https://override.example.com', VITE_API_PROXY: '1' });
  assert.equal(config.rewrites[0].destination, 'https://override.example.com/api/:path*');
});
