/**
 * 8th Wall + fplaces AR configuration.
 */
(function () {
  const params = new URLSearchParams(window.location.search);

  window.FPLACES_AR_CONFIG = {
    /** Bumped when AR camera/SLAM boot changes - check console on load. */
    buildId: "20260910-slam-resume-v1",
    eighthWallAppKey: "",
    xrMode: "auto",
    arrowDistanceM: 2.5,
    showPathInWorld: true,
    useWorldRoute: true,
    useGpsProgress: true,
    useSlamHeading: true,
    useSlamPoseFusion: true,
    slamPoseCorrectionM: 3,
    /** Off by default: auto-compass on a black XR canvas was killing SLAM. */
    poorLightingPrompt: false,
    poorLightingDarkLuma: 22,
    poorLightingDimLuma: 48,
    poorLightingLowContrast: 11,
    useWebGlArrows: true,
    usePathRibbon: false,
    /** Red current-position pin - off; trail chevrons + HUD carry guidance. */
    showLeadingLocationMarker: false,
    /** Sliding 2-slot trail — reconcile to marks; never append/fan. */
    useIncrementalPath: true,
    incrementalPathHorizonM: 22,
    /** Drop a chevron once the user is this close along the path (meters). */
    incrementalPathPassM: 0.8,
    /** Refuse a second chevron closer than this in world XZ (meters). */
    incrementalPathMinSeparationM: 2.4,
    incrementalPathSpacingM: 4,
    incrementalPathMaxVisible: 2,
    /**
     * Opening stretch: 1–2 chevrons clearly in camera (~2.5 m lead), not a pile
     * and not so far ahead that the road looks empty.
     */
    nearFieldStartM: 6,
    nearFieldSpacingM: 4,
    nearFieldMaxArrows: 2,
    nearFieldArrowScale: 0.9,
    nearFieldLeadGapM: 2.5,
    /** When remaining path is short, shrink reveal + density instead of dumping a full trail. */
    shortRemainingThresholdM: 12,
    shortRemainingRevealM: 4,
    /** Hide trail when this close to destination (arrival imminent). */
    arrivalClearRemainingM: 1.8,
    /** Gold destination pin only when remaining walk is this close. */
    destinationRevealRemainingM: 8,
    floorArrowSpacingM: 3,
    floorArrowCount: 6,
    floorArrowLeadInM: 1.1,
    /** Single leading guidance arrow - meters ahead along path floor. */
    leadingArrowDistanceM: 2.2,
    /** Visual scale - match trail chevrons (Google shows uniform row). */
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

  const cameraReady = params.get("cameraReady");
  if (cameraReady === "1" || cameraReady === "true") {
    window.FPLACES_AR_CONFIG.cameraReady = true;
  }

  // SLAM needs a secure context (HTTPS). Off-venue demo is fine once XR runs.
  if (!params.get("xrMode") && !window.isSecureContext) {
    window.FPLACES_AR_CONFIG.xrMode = "fallback";
  }
})();
