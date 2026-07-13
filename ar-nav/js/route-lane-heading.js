/**
 * Device heading: instant display + optional route-target smoothing.
 */
(function () {
  const TARGET_SMOOTH = 0.22;
  const MIN_COURSE_MOVE_M = 1.8;

  let instantHeading = null;
  let smoothedTargetBearing = null;
  let lastCourseSample = null;

  function normalizeDegrees(deg) {
    return ((deg % 360) + 360) % 360;
  }

  function normalizeDeltaDegrees(delta) {
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  function lerpAngleDegrees(current, target, alpha) {
    if (current == null || Number.isNaN(current)) return normalizeDegrees(target);
    const delta = normalizeDeltaDegrees(target - current);
    return normalizeDegrees(current + delta * alpha);
  }

  function setInstantHeading(rawHeading) {
    if (rawHeading == null || Number.isNaN(rawHeading)) return instantHeading;
    instantHeading = normalizeDegrees(rawHeading);
    return instantHeading;
  }

  function ingestCourseSample(lat, lng) {
    if (lat == null || lng == null) return null;
    if (!lastCourseSample) {
      lastCourseSample = { lat, lng };
      return null;
    }

    const R = window.FplacesGeoMath?.EARTH_RADIUS_M ?? 6371000;
    const dLat = ((lat - lastCourseSample.lat) * Math.PI) / 180;
    const dLng = ((lng - lastCourseSample.lng) * Math.PI) / 180;
    const lat1 = (lastCourseSample.lat * Math.PI) / 180;
    const lat2 = (lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const distM = 2 * R * Math.asin(Math.sqrt(h));
    if (distM < MIN_COURSE_MOVE_M) return null;

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const course = normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
    lastCourseSample = { lat, lng };
    instantHeading = course;
    return course;
  }

  function reset() {
    instantHeading = null;
    smoothedTargetBearing = null;
    lastCourseSample = null;
  }

  function resolveDeviceHeading(state) {
    if (window.FplacesSlamHeading?.isActive?.()) {
      const slam = window.FplacesSlamHeading.getHeadingDegrees?.();
      if (slam != null && !Number.isNaN(slam)) {
        instantHeading = normalizeDegrees(slam);
        return instantHeading;
      }
    }

    const ext = state?.externalHeadingDegrees;
    if (typeof ext === 'number' && !Number.isNaN(ext)) {
      instantHeading = normalizeDegrees(ext);
    }
    if (state?.lastPosition?.latitude != null && state?.lastPosition?.longitude != null) {
      ingestCourseSample(state.lastPosition.latitude, state.lastPosition.longitude);
    }
    return instantHeading;
  }

  function smoothTargetBearing(targetBearing) {
    if (targetBearing == null || Number.isNaN(targetBearing)) return null;
    const target = normalizeDegrees(targetBearing);
    if (smoothedTargetBearing == null) {
      smoothedTargetBearing = target;
      return target;
    }
    smoothedTargetBearing = lerpAngleDegrees(smoothedTargetBearing, target, TARGET_SMOOTH);
    return smoothedTargetBearing;
  }

  function computeAlignmentDelta(targetBearing, deviceHeading) {
    if (targetBearing == null) return null;
    const target = smoothTargetBearing(targetBearing);
    if (deviceHeading == null) return null;
    return normalizeDeltaDegrees(target - deviceHeading);
  }

  window.FplacesRouteLaneHeading = {
    reset,
    normalizeDeltaDegrees,
    setInstantHeading,
    ingestCourseSample,
    resolveDeviceHeading,
    smoothTargetBearing,
    computeAlignmentDelta,
    getInstantHeading() {
      return instantHeading;
    },
    getSmoothedTargetBearing() {
      return smoothedTargetBearing;
    },
    // Legacy aliases used elsewhere
    ingestCompassSample(raw, _event) {
      return setInstantHeading(raw);
    },
    getSmoothedHeading() {
      return instantHeading;
    },
    computeLaneDeltaDeg(target, deviceHeading) {
      return computeAlignmentDelta(target, deviceHeading);
    },
    shouldUpdateLane() {
      return true;
    },
  };
})();
