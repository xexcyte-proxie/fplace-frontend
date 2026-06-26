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
  arUrl: import.meta.env.VITE_AR_URL ?? (import.meta.env.DEV ? '/ar/' : 'https://fplaces-test.netlify.app/'),
  mapInitTimeoutMs: 45_000,
  positioning: {
    bleRssiThresholdDbm: -70,
    bleScanIntervalMs: Number(import.meta.env.VITE_BLE_SCAN_INTERVAL_MS) || 500,
    indoorAtlasFloorCertaintyMin: 0.5,
  },
  debug: {
    positionHud:
      import.meta.env.DEV || import.meta.env.VITE_DEBUG_POSITION_HUD === '1',
  },
};
