import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const pwaRoot = fileURLToPath(new URL('../', import.meta.url));
const env = { ...loadEnv('production', pwaRoot, ''), ...process.env };
const origin = (env.VITE_API_URL ?? '').trim().replace(/\/$/, '');
if (!origin || !['http:', 'https:'].includes(new URL(origin).protocol)) {
  throw new Error('Set VITE_API_URL to a backend HTTP(S) origin.');
}
// The build command runs in the selected Vercel Root Directory.
const output = path.resolve(process.cwd(), '.vercel/output');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(pwaRoot, 'dist'), path.join(output, 'static'), { recursive: true });
const routes = [
  { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
  { src: '/(?!assets/)(.*)', headers: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=()',
  }, continue: true },
  ...(env.VITE_API_PROXY === '1' ? [{ src: '/api/(.*)', dest: `${origin}/api/$1` }] : []),
  { handle: 'filesystem' },
  { src: '/api/(.*)', status: 404 },
  { src: '/assets/(.*)', status: 404 },
  { src: '/ar/(.*)', dest: '/ar/index.html' },
  { src: '/(.*)', dest: '/index.html' },
];
await writeFile(path.join(output, 'config.json'), JSON.stringify({ version: 3, routes }, null, 2)+'\n');
console.log(`Prepared Vercel static output and environment-based routes in ${output}`);
