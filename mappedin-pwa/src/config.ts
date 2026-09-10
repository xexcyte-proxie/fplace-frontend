/** Venue map defaults. Tokens come from the backend unless local key/secret is set. */
export const appConfig = {
  mappedin: {
    /**
     * Optional local testing override. When both are set, getMapData uses
     * key/secret instead of the backend Mappedin token.
     */
    key: (import.meta.env.VITE_MAPPEDIN_KEY ?? '').trim(),
    secret: (import.meta.env.VITE_MAPPEDIN_SECRET ?? '').trim(),
    /**
     * Default map until a venue's `mappedin_map_id` is selected.
     * Not a secret; override with VITE_MAPPEDIN_MAP_ID.
     */
    mapId: import.meta.env.VITE_MAPPEDIN_MAP_ID ?? '65c0ff7430b94e3fabd5bb8c',
    venueName: 'Demo Mall',
  },
  /**
   * API origin. Empty = same-origin `/api` (proxied to the AWS ALB in Vite dev + Netlify).
   * Set VITE_API_URL only when the backend allows your origin via CORS.
   */
  apiUrl: (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''),
  /**
   * WebSocket origin for venue rooms (`/ws/venues/<id>/`).
   * Required in production (Netlify cannot proxy WebSocket upgrades).
   * Local dev: leave unset to use Vite's `/ws` proxy, or set to bypass proxy issues.
   * `http://` values are converted to `ws://`.
   */
  wsUrl: (import.meta.env.VITE_WS_URL ?? '').replace(/\/$/, ''),
  /**
   * Google OAuth Web client ID for Sign-In (`id_token` → POST /api/users/login/google/).
   * Leave empty to hide Google Sign-In until configured.
   */
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim(),
  arUrl: import.meta.env.VITE_AR_URL ?? '/ar/',
  /** Must match ar-nav/config.js buildId - busts iframe cache after AR deploys. */
  arBuildId: import.meta.env.VITE_AR_BUILD_ID ?? '20260910-slam-resume-v1',
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
