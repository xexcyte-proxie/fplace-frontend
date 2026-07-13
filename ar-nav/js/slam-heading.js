/**
 * Device heading from 8th Wall / Three.js SLAM camera yaw (replaces compass in XR mode).
 */
(function () {
  const SMOOTH = 0.32;
  let active = false;
  let cameraRef = null;
  let offsetDeg = 0;
  let smoothedDeg = null;
  let calibrated = false;
  let forwardScratch = null;
  let quatScratch = null;

  function normalizeDegrees(deg) {
    return ((deg % 360) + 360) % 360;
  }

  function ensureThreeScratch() {
    const THREE = window.THREE;
    if (!THREE) return false;
    if (!forwardScratch) forwardScratch = new THREE.Vector3();
    if (!quatScratch) quatScratch = new THREE.Quaternion();
    return true;
  }

  /** Raw horizontal yaw from camera world pose (0° = initial SLAM forward). */
  function readRawYawDegrees(camera) {
    if (!camera || !ensureThreeScratch()) return null;

    forwardScratch.set(0, 0, -1);
    camera.getWorldQuaternion(quatScratch);
    forwardScratch.applyQuaternion(quatScratch);

    const len = Math.hypot(forwardScratch.x, forwardScratch.z);
    if (len < 1e-4) return smoothedDeg;

    const yawRad = Math.atan2(forwardScratch.x, -forwardScratch.z);
    return normalizeDegrees((yawRad * 180) / Math.PI);
  }

  function attach(camera) {
    cameraRef = camera || null;
    active = !!cameraRef;
    smoothedDeg = null;
    window.FplacesArDebug?.log('SlamHeading', 'Attached to XR camera', { active });
    return active;
  }

  function activate(camera) {
    return attach(camera);
  }

  function deactivate() {
    active = false;
    cameraRef = null;
    smoothedDeg = null;
    offsetDeg = 0;
    calibrated = false;
  }

  function calibrate(camera, routeBearingDeg) {
    const cam = camera || cameraRef;
    if (!cam || routeBearingDeg == null || Number.isNaN(routeBearingDeg)) return false;

    const raw = readRawYawDegrees(cam);
    if (raw == null) return false;

    offsetDeg = normalizeDegrees(routeBearingDeg - raw);
    smoothedDeg = normalizeDegrees(raw + offsetDeg);
    calibrated = true;
    window.FplacesRouteLaneHeading?.setInstantHeading?.(smoothedDeg);

    window.FplacesArDebug?.log('SlamHeading', 'Calibrated to route bearing', {
      routeBearingDeg,
      rawYawDeg: raw,
      offsetDeg,
      headingDeg: smoothedDeg,
    });
    return true;
  }

  function update(camera) {
    const cam = camera || cameraRef;
    if (!active || !cam) return null;

    const raw = readRawYawDegrees(cam);
    if (raw == null) return smoothedDeg;

    const mapped = normalizeDegrees(raw + offsetDeg);
    if (smoothedDeg == null) {
      smoothedDeg = mapped;
    } else {
      let delta = mapped - smoothedDeg;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      smoothedDeg = normalizeDegrees(smoothedDeg + delta * SMOOTH);
    }

    window.FplacesRouteLaneHeading?.setInstantHeading?.(smoothedDeg);
    return smoothedDeg;
  }

  function getHeadingDegrees() {
    return smoothedDeg;
  }

  function isActive() {
    return active && cameraRef != null;
  }

  function isCalibrated() {
    return calibrated;
  }

  window.FplacesSlamHeading = {
    attach,
    activate,
    deactivate,
    calibrate,
    update,
    getHeadingDegrees,
    isActive,
    isCalibrated,
    getOffsetDegrees() {
      return offsetDeg;
    },
    /** Raw SLAM yaw (0° = session-start forward) — used for world-frame alignment. */
    getRawYawDegrees(camera) {
      return readRawYawDegrees(camera || cameraRef);
    },
  };
})();
