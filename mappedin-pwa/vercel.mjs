import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Match Vite's production defaults; hosting environment values take precedence.
const defaults = parseEnv(readFileSync(new URL('./.env.production', import.meta.url), 'utf8'));
const env = { ...defaults, ...process.env };
const proxyEnabled = env.VITE_API_PROXY === '1';
const origin = (env.VITE_API_URL ?? '').trim().replace(/\/$/, '');
if (!origin || !['http:', 'https:'].includes(new URL(origin).protocol)) {
  throw new Error('Set VITE_API_URL to the backend HTTP(S) origin.');
}

export const config = {
  framework: 'vite',
  installCommand: 'npm ci',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  rewrites: [
    ...(proxyEnabled ? [{ source: '/api/:path*', destination: `${origin}/api/:path*` }] : []),
    { source: '/ar/:path*', destination: '/ar/index.html' },
    { source: '/((?!api/|assets/|ar/).*)', destination: '/index.html' },
  ],
  headers: [
    { source: '/(.*)', headers: [
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
    ] },
    { source: '/assets/:path*', headers: [
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ] },
  ],
};
