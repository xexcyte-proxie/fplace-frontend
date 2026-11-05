import { DEFAULT_MAPPEDIN_MAP_ID } from './forum/domain/venue-map-source';

/** Venue map defaults. Catalog venues load via backend token + `mappedin_map_id`. */
export const appConfig = {
  mappedin: {
    /**
     * Fallback map id when a venue has no `mappedin_map_id`.
     * Catalog venues use each venue's backend map id.
     */
    mapId: import.meta.env.VITE_MAPPEDIN_MAP_ID ?? DEFAULT_MAPPEDIN_MAP_ID,
    venueName: 'Venue',
  },
  /**
   * API origin from VITE_API_URL. The backend must allow the frontend origin.
   * VITE_API_PROXY=1 uses same-origin /api with an environment-generated proxy.
   */
  apiUrl: import.meta.env.VITE_API_PROXY === '1'
    ? ''
    : (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''),
  /**
   * WebSocket origin for live rooms (`/ws/venues/<id>/`,
   * `/ws/venues/<id>/locations/<location_id>/`, `/ws/notifications/`).
   * Falls back to the configured API origin when VITE_WS_URL is unset.
   * HTTP(S) values are converted to WS(S), preserving transport security.
   */
  wsUrl: (import.meta.env.VITE_WS_URL ?? '').replace(/\/$/, ''),
  /**
   * Google OAuth Web client ID for Sign-In (`id_token` → POST /api/users/login/google/).
   * Leave empty to hide Google Sign-In until configured.
   */
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim(),
  arUrl: import.meta.env.VITE_AR_URL ?? '/ar/',
  /** Must match ar-nav/config.js buildId - busts iframe cache after AR deploys. */
  arBuildId: import.meta.env.VITE_AR_BUILD_ID ?? '20261031-arrival-parity-v1',
  mapInitTimeoutMs: 45_000,
  positioning: {
    bleRssiThresholdDbm: -70,
    bleScanIntervalMs: Number(import.meta.env.VITE_BLE_SCAN_INTERVAL_MS) || 500,
    indoorAtlasFloorCertaintyMin: 0.5,
  },
  debug: {
    // Off for now - set VITE_DEBUG_POSITION_HUD=1 to re-enable the overlay.
    positionHud: import.meta.env.VITE_DEBUG_POSITION_HUD === '1',
    arSlamDiag:
      import.meta.env.DEV || import.meta.env.VITE_AR_SLAM_DIAG === '1',
  },
};
