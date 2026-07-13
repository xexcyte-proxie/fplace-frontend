/**
 * Fuse Mappedin venue position with SLAM camera translation between updates.
 */
(function () {
  const VENUE_BLEND = 0.12;
  let active = false;
  let calibrated = false;
  let cameraRef = null;

  let calibSlamX = 0;
  let calibSlamZ = 0;
  let calibAlongM = 0;
  let calibRouteBearing = 0;

  let lastSlamX = null;
  let lastSlamZ = null;
  let lastVenueAlongM = null;
  let lastVenueAt = 0;
  let fusedAlongM = null;

  function normalizeDegrees(deg) {
    return ((deg % 360) + 360) % 360;
  }

  function totalPathMeters(navigator) {
    const path = navigator?.route?.pathCoordinates || [];
    if (!path.length) return 0;
    return window.FplacesRouteGeometry.totalPathLengthMeters(path);
  }

  function routeBearingAtAlong(navigator, alongM) {
    const path = navigator?.route?.pathCoordinates || [];
    const geo = window.FplacesRouteGeometry;
    if (!path.length || !geo) return navigator?.getTargetBearingDegrees?.() ?? 0;

    const snap = geo.snapAtDistanceAlongPath(path, alongM);
    const ahead = geo.snapAtDistanceAlongPath(path, alongM + 2);
    if (!snap || !ahead) return navigator?.getTargetBearingDegrees?.() ?? 0;

    const local = geo.toLocalMeters(snap, ahead);
    if (Math.hypot(local.x, local.y) < 0.01) {
      return navigator?.getTargetBearingDegrees?.() ?? 0;
    }
    return normalizeDegrees((Math.atan2(local.x, local.y) * 180) / Math.PI);
  }

  function routeForwardXZ(bearingDeg) {
    // Geographic bearing → SLAM-frame yaw: apply the anchor's north alignment
    // (SLAM −Z is session-start facing, not north).
    const yawOffsetDeg =
      window.FplacesAnchorEngine?.getWorldYawOffsetDeg?.() ?? 0;
    const rad = ((bearingDeg + yawOffsetDeg) * Math.PI) / 180;
    return { x: Math.sin(rad), z: -Math.cos(rad) };
  }

  function getSlamDelta() {
    if (!calibrated || lastSlamX == null || lastSlamZ == null) {
      return { dx: 0, dz: 0 };
    }
    return {
      dx: lastSlamX - calibSlamX,
      dz: lastSlamZ - calibSlamZ,
    };
  }

  function predictAlongFromSlam(navigator) {
    if (!calibrated) return null;
    const { dx, dz } = getSlamDelta();
    const forward = routeForwardXZ(calibRouteBearing);
    const progress = dx * forward.x + dz * forward.z;
    const total = totalPathMeters(navigator);
    return Math.max(0, Math.min(total, calibAlongM + progress));
  }

  function calibrate(camera, navigator, snap, alongM) {
    const cam = camera || cameraRef;
    if (!cam || !navigator || !snap) return false;

    cameraRef = cam;
    active = true;
    calibSlamX = cam.position.x;
    calibSlamZ = cam.position.z;
    lastSlamX = calibSlamX;
    lastSlamZ = calibSlamZ;
    calibAlongM = Math.max(0, alongM ?? snap.distanceAlongPathMeters ?? 0);
    calibRouteBearing =
      navigator.getTargetBearingDegrees?.() ??
      routeBearingAtAlong(navigator, calibAlongM);
    fusedAlongM = calibAlongM;
    lastVenueAlongM = calibAlongM;
    lastVenueAt = performance.now();
    calibrated = true;

    window.FplacesArDebug?.log('SlamPose', 'Calibrated pose fusion', {
      calibAlongM: calibAlongM,
      calibRouteBearing,
      slamX: calibSlamX,
      slamZ: calibSlamZ,
    });
    return true;
  }

  function activate(camera) {
    cameraRef = camera || null;
    active = !!cameraRef;
    return active;
  }

  function deactivate() {
    active = false;
    calibrated = false;
    cameraRef = null;
    lastSlamX = null;
    lastSlamZ = null;
    lastVenueAlongM = null;
    fusedAlongM = null;
    lastVenueAt = 0;
  }

  function isActive() {
    return active && calibrated;
  }

  function isVenueFeedFresh(navigator) {
    const cfg = window.FPLACES_AR_CONFIG || {};
    return window.FplacesIndoorPosition?.isVenueFeed?.(
      cfg,
      navigator?.positionSource,
      navigator?._lastExternalAt,
    );
  }

  function ingestVenue(navigator, position) {
    if (!active || !calibrated || !navigator) return;

    if (
      navigator.isParentSimulatorAuthority?.() &&
      navigator.positionSource === 'simulator'
    ) {
      return;
    }

    if (!window.FplacesIndoorPosition?.isVenueSource?.(navigator.positionSource)) {
      return;
    }

    navigator.ensureSnap?.();
    const snap = navigator.snappedOnPath;
    if (!snap) return;

    const along = snap.distanceAlongPathMeters ?? 0;
    const slamAlong = predictAlongFromSlam(navigator);
    const cfg = window.FPLACES_AR_CONFIG || {};
    const correctionM = cfg.slamPoseCorrectionM ?? 3;

    if (
      slamAlong != null &&
      Math.abs(along - slamAlong) > correctionM &&
      cameraRef
    ) {
      calibrate(cameraRef, navigator, snap, along);
      window.FplacesArDebug?.log('SlamPose', 'Re-anchored SLAM to venue fix', {
        venueAlongM: along,
        slamAlongM: slamAlong,
        correctionM,
      });
      return;
    }

    lastVenueAlongM = along;
    fusedAlongM = along;
    lastVenueAt = performance.now();
  }

  function update(camera) {
    if (!active || !camera) return null;
    cameraRef = camera;
    lastSlamX = camera.position.x;
    lastSlamZ = camera.position.z;

    const slamAlong = predictAlongFromSlam(window.__fplacesNavigator);
    if (slamAlong != null) fusedAlongM = slamAlong;
    return fusedAlongM;
  }

  function getFusedAlongPathMeters(navigator, gpsAlongFallback) {
    if (!active || !calibrated || !navigator) return null;

    const cfg = window.FPLACES_AR_CONFIG || {};
    if (cfg.useSlamPoseFusion === false) return null;

    if (
      navigator.isParentSimulatorAuthority?.() &&
      navigator.positionSource === 'simulator'
    ) {
      return null;
    }

    const total = totalPathMeters(navigator);
    const slamAlong = predictAlongFromSlam(navigator);
    if (slamAlong == null) return null;

    if (isVenueFeedFresh(navigator) && lastVenueAlongM != null) {
      const blended =
        lastVenueAlongM * (1 - VENUE_BLEND) + slamAlong * VENUE_BLEND;
      return Math.max(0, Math.min(total, blended));
    }

    return Math.max(0, Math.min(total, slamAlong));
  }

  function shouldUseFusion(navigator) {
    if (!isActive() || !navigator) return false;
    const cfg = window.FPLACES_AR_CONFIG || {};
    if (cfg.useSlamPoseFusion === false) return false;
    if (
      navigator.isParentSimulatorAuthority?.() &&
      navigator.positionSource === 'simulator'
    ) {
      return false;
    }
    return (
      window.FplacesSlamHeading?.isActive?.() ||
      window.FplacesAnchorEngine?.isCalibrated
    );
  }

  window.FplacesSlamPose = {
    activate,
    deactivate,
    calibrate,
    update,
    ingestVenue,
    getFusedAlongPathMeters,
    predictAlongFromSlam,
    shouldUseFusion,
    isActive,
    isVenueFeedFresh,
  };
})();
