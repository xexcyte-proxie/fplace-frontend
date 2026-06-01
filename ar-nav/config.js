/**
 * 8th Wall + fplaces AR configuration.
 *
 * As of Feb 2026, 8th Wall is open source at https://8thwall.org — no account or App Key.
 * SLAM uses @8thwall/engine-binary from npm/CDN. Deploy ar-nav/ to Netlify (HTTPS).
 */
(function () {
  const params = new URLSearchParams(window.location.search);

  window.FPLACES_AR_CONFIG = {
    /** @deprecated Hosted platform retired; only used if xrMode is "platform" */
    eighthWallAppKey: '',

    /**
     * auto     — @8thwall/engine-binary (no key; default)
     * binary   — same as auto
     * platform — legacy apps.8thwall.com/xrweb (retired; needs old app key)
     * fallback — camera HUD only, no XR8 / SLAM
     */
    xrMode: 'auto',

    /** Meters in front of the user for the direction arrow mesh */
    arrowDistanceM: 2.5,

    /** Show ground path in SLAM space (disabled — GPS path ≠ SLAM origin) */
    showPathInWorld: false,

    /** Enable GPS progress along pathCoordinates (outdoor / window only) */
    useGpsProgress: true,
  };

  const urlKey = params.get('appKey');
  if (urlKey) {
    window.FPLACES_AR_CONFIG.eighthWallAppKey = urlKey;
  }

  const urlMode = params.get('xrMode');
  if (urlMode) {
    window.FPLACES_AR_CONFIG.xrMode = urlMode;
  }
})();
