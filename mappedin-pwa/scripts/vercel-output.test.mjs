import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const pwaRoot = fileURLToPath(new URL('../', import.meta.url));

test('both project roots explicitly run Vercel output packaging', () => {
  for (const root of [pwaRoot, path.resolve(pwaRoot, '..')]) {
    const config = JSON.parse(readFileSync(path.join(root, 'vercel.json')));
    assert.match(config.buildCommand, /prepare-vercel-output\.mjs$/);
    assert.equal(config.framework, null);
    assert.ok(!existsSync(path.join(root, 'vercel.mjs')));
  }
});

test('Vercel output includes frontend, AR assets, proxy override and SPA routes', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'fplaces-vercel-output-'));
  try {
    const result = spawnSync(process.execPath, [path.join(pwaRoot, 'scripts/prepare-vercel-output.mjs')], {
      cwd: temporary,
      env: { ...process.env, VITE_API_URL: 'https://override.example.com', VITE_API_PROXY: '1' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const output = path.join(temporary, '.vercel/output');
    assert.ok(existsSync(path.join(output, 'static/index.html')));
    assert.ok(existsSync(path.join(output, 'static/ar/index.html')));
    const config = JSON.parse(readFileSync(path.join(output, 'config.json')));
    assert.equal(config.version, 3);
    const api = config.routes.find(route => route.src === '/api/(.*)' && route.dest);
    assert.equal(api.dest, 'https://override.example.com/api/$1');
    assert.ok(config.routes.indexOf(api) < config.routes.findIndex(route => route.handle === 'filesystem'));
    assert.deepEqual(config.routes.at(-1), { src: '/(.*)', dest: '/index.html' });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
