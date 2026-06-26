import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arNavRoot = path.join(repoRoot, 'ar-nav');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveArNav(): Plugin {
  const handler: Parameters<NonNullable<Plugin['configureServer']>>[0]['middlewares']['use'] =
    (req, res, next) => {
      const rawUrl = req.url?.split('?')[0] ?? '';
      if (!rawUrl.startsWith('/ar')) return next();

      let rel = rawUrl.slice('/ar'.length);
      if (!rel || rel === '/') rel = '/index.html';
      if (rel.endsWith('/')) rel += 'index.html';

      const filePath = path.normalize(path.join(arNavRoot, rel));
      if (!filePath.startsWith(arNavRoot)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (error, data) => {
        if (error) {
          next();
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
        res.end(data);
      });
    };

  return {
    name: 'serve-ar-nav',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [
    serveArNav(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Indoor Nav',
        short_name: 'Indoor Nav',
        description: 'Mappedin indoor wayfinding with real-time Blue Dot',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.mappedin\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mappedin-cdn',
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    fs: {
      allow: [repoRoot],
    },
  },
  preview: {
    host: true,
    port: 4173,
    fs: {
      allow: [repoRoot],
    },
  },
});
