/** Mappedin Demo Mall — override via .env (see .env.example). */
export const appConfig = {
  mappedin: {
    key: import.meta.env.VITE_MAPPEDIN_KEY ?? 'mik_yeBk0Vf0nNJtpesfu560e07e5',
    secret:
      import.meta.env.VITE_MAPPEDIN_SECRET ??
      'mis_2g9ST8ZcSFb5R9fPnsvYhrX3RyRwPtDGbMGweCYKEq385431022',
    mapId: import.meta.env.VITE_MAPPEDIN_MAP_ID ?? '65c0ff7430b94e3fabd5bb8c',
    venueName: 'Demo Mall',
  },
  /**
   * API origin. Empty = same-origin `/api` (proxied to fplaces-backend in Vite dev + Netlify).
   * Set VITE_API_URL only when the backend allows your origin via CORS.
   */
  apiUrl: (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''),
  arUrl: import.meta.env.VITE_AR_URL ?? '/ar/',
  /** Must match ar-nav/config.js buildId — busts iframe cache after AR deploys. */
  arBuildId: import.meta.env.VITE_AR_BUILD_ID ?? '20260707-camera-v18',
  mapInitTimeoutMs: 45_000,
  positioning: {
    bleRssiThresholdDbm: -70,
    bleScanIntervalMs: Number(import.meta.env.VITE_BLE_SCAN_INTERVAL_MS) || 500,
    indoorAtlasFloorCertaintyMin: 0.5,
  },
  debug: {
    positionHud:
      import.meta.env.DEV || import.meta.env.VITE_DEBUG_POSITION_HUD === '1',
    arSlamDiag:
      import.meta.env.DEV || import.meta.env.VITE_AR_SLAM_DIAG === '1',
  },
};
