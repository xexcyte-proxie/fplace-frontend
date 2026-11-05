import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('keeps browser requests same-origin when the API proxy is enabled', async () => {
  vi.stubEnv('VITE_API_URL', 'http://upstream.example.com');
  vi.stubEnv('VITE_API_PROXY', '1');
  vi.resetModules();
  const { appConfig } = await import('../config');
  expect(appConfig.apiUrl).toBe('');
});

it('uses the configured API origin when proxy mode is disabled', async () => {
  vi.stubEnv('VITE_API_URL', 'https://api.example.com/');
  vi.stubEnv('VITE_API_PROXY', '0');
  vi.resetModules();
  const { appConfig } = await import('../config');
  expect(appConfig.apiUrl).toBe('https://api.example.com');
});
