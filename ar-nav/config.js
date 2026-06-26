/**
 * 8th Wall + fplaces AR configuration.
 */
(function () {
  const params = new URLSearchParams(window.location.search);

  window.FPLACES_AR_CONFIG = {
    eighthWallAppKey: '',
    xrMode: 'auto',
    arrowDistanceM: 2.5,
    showPathInWorld: true,
    useWorldRoute: true,
    useGpsProgress: true,
    useWebGlArrows: true,
    preferVenuePositioning: false,
    demoSimWalk: false,
    externalPositionTimeoutMs: 3500,
    xrLoadTimeoutMs: 12000,
    arDebug: true,
    arDebugPanel: true,
    /** Production PWA origin allowed to postMessage into this AR frame (e.g. https://your-pwa.app). */
    pwaOrigin: '',
  };

  const urlKey = params.get('appKey');
  if (urlKey) {
    window.FPLACES_AR_CONFIG.eighthWallAppKey = urlKey;
  }

  const urlMode = params.get('xrMode');
  if (urlMode) {
    window.FPLACES_AR_CONFIG.xrMode = urlMode;
  }

  const gps = params.get('useGpsProgress');
  if (gps === '0' || gps === 'false') {
    window.FPLACES_AR_CONFIG.useGpsProgress = false;
  }

  const positioning = params.get('positioning');
  if (positioning === 'mappedin' || positioning === 'venue') {
    window.FPLACES_AR_CONFIG.preferVenuePositioning = true;
    window.FPLACES_AR_CONFIG.useGpsProgress = false;
    window.FPLACES_AR_CONFIG.useWorldRoute = true;
  }

  const demoSim = params.get('demoSim');
  if (demoSim === '1' || demoSim === 'true') {
    window.FPLACES_AR_CONFIG.demoSimWalk = true;
  }

  const worldRoute = params.get('worldRoute');
  if (worldRoute === '0' || worldRoute === 'false') {
    window.FPLACES_AR_CONFIG.useWorldRoute = false;
  }

  const pwaOrigin = params.get('pwaOrigin');
  if (pwaOrigin) {
    window.FPLACES_AR_CONFIG.pwaOrigin = pwaOrigin;
  }

  // 8th Wall WebGL SLAM needs HTTPS + a real device; skip on local HTTP dev.
  if (!params.get('xrMode')) {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (isLocalHost || !window.isSecureContext) {
      window.FPLACES_AR_CONFIG.xrMode = 'fallback';
    }
  }
})();
