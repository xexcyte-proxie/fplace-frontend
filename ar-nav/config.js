/**
 * 8th Wall + fplaces AR configuration.
 */
(function () {
  const params = new URLSearchParams(window.location.search);

  window.FPLACES_AR_CONFIG = {
    /** Bumped when AR camera/SLAM boot changes — check console on load. */
    buildId: "20260707-camera-v18",
    eighthWallAppKey: "",
    xrMode: "auto",
    arrowDistanceM: 2.5,
    showPathInWorld: true,
    useWorldRoute: true,
    useGpsProgress: true,
    useSlamHeading: true,
    useSlamPoseFusion: true,
    slamPoseCorrectionM: 3,
    useWebGlArrows: true,
    usePathRibbon: false,
    /** Incremental world-anchored path — append segments as user walks (default on). */
    useIncrementalPath: true,
    /** Hard cap on how far ahead arrows may ever exist. */
    incrementalPathHorizonM: 22,
    incrementalPathPruneBehindM: 14,
    /** Progressive reveal: arrows spawn only this far ahead of current progress. */
    incrementalPathRevealAheadM: 8,
    /** One-at-a-time build-up: min delay between consecutive arrow spawns. */
    incrementalPathSpawnIntervalMs: 260,
    incrementalPathSpacingM: 4.0,
    floorArrowSpacingM: 3.0,
    turnCurveBendM: 2.2,
    turnCurveArrowSpacingM: 2.0,
    floorArrowCount: 6,
    floorArrowLeadInM: 1.1,
    /** Single leading guidance arrow — meters ahead along path floor. */
    leadingArrowDistanceM: 2.2,
    /** Visual scale — match trail chevrons (Google shows uniform row). */
    leadingArrowScale: 1.22,
    /** Advance to next path node when within this distance (Google AR: 2–5 m). */
    waypointAdvanceThresholdM: 3,
    /** Per-frame Quaternion.Slerp factor toward target orientation. */
    arrowRotationSlerpT: 0.15,
    /** π rad Euler-only correction for trail chevron rotation.y (pathHeadingYawRad). Not used by LookRotation. */
    arrowHeadingOffsetRad: Math.PI,
    preferVenuePositioning: false,
    demoSimWalk: false,
    autoCalibrate: false,
    externalPositionTimeoutMs: 3500,
    xrLoadTimeoutMs: 25000,
    arDebug: false,
    arDebugPanel: false,
    /** Production PWA origin allowed to postMessage into this AR frame (e.g. https://your-pwa.app). */
    pwaOrigin: "",
  };

  const urlKey = params.get("appKey");
  if (urlKey) {
    window.FPLACES_AR_CONFIG.eighthWallAppKey = urlKey;
  }

  const urlMode = params.get("xrMode");
  if (urlMode) {
    window.FPLACES_AR_CONFIG.xrMode = urlMode;
  }

  const gps = params.get("useGpsProgress");
  if (gps === "0" || gps === "false") {
    window.FPLACES_AR_CONFIG.useGpsProgress = false;
  }

  const positioning = params.get("positioning");
  if (positioning === "mappedin" || positioning === "venue") {
    window.FPLACES_AR_CONFIG.preferVenuePositioning = true;
    window.FPLACES_AR_CONFIG.useGpsProgress = false;
    const worldDisabled =
      params.get("worldRoute") === "0" || params.get("worldRoute") === "false";
    if (!worldDisabled) {
      window.FPLACES_AR_CONFIG.useWorldRoute = true;
    }
  }

  const arDebug = params.get("arDebug");
  if (arDebug === "1" || arDebug === "true") {
    window.FPLACES_AR_CONFIG.arDebug = true;
    window.FPLACES_AR_CONFIG.arDebugPanel = true;
  } else if (arDebug === "0" || arDebug === "false") {
    window.FPLACES_AR_CONFIG.arDebug = false;
    window.FPLACES_AR_CONFIG.arDebugPanel = false;
  }

  const demoSim = params.get("demoSim");
  if (demoSim === "1" || demoSim === "true") {
    window.FPLACES_AR_CONFIG.demoSimWalk = true;
  }

  const autoCalibrate = params.get("autoCalibrate");
  if (autoCalibrate === "1" || autoCalibrate === "true") {
    window.FPLACES_AR_CONFIG.autoCalibrate = true;
  }

  const worldRoute = params.get("worldRoute");
  if (worldRoute === "0" || worldRoute === "false") {
    window.FPLACES_AR_CONFIG.useWorldRoute = false;
  }

  const pwaOrigin = params.get("pwaOrigin");
  if (pwaOrigin) {
    window.FPLACES_AR_CONFIG.pwaOrigin = pwaOrigin;
  }

  // SLAM needs a secure context (HTTPS). Off-venue demo is fine once XR runs.
  if (!params.get("xrMode") && !window.isSecureContext) {
    window.FPLACES_AR_CONFIG.xrMode = "fallback";
  }
})();
