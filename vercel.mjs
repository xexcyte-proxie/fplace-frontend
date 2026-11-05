import { config as pwaConfig } from './mappedin-pwa/vercel.mjs';

export const config = {
  ...pwaConfig,
  installCommand: 'npm ci --prefix mappedin-pwa',
  buildCommand: 'npm run build --prefix mappedin-pwa',
  outputDirectory: 'mappedin-pwa/dist',
};
