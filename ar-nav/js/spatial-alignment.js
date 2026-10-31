/** Tracking and visual recovery gate. Never changes navigation progress. */
(function () {
  const HEADING_MAX_AGE_MS = 1500;
  const FACING_TOLERANCE_DEG = 30;
  const FACING_STABLE_MS = 300;
  const MISSING_ARROW_MS = 800;
  let status = 'UNKNOWN';
  let needsManual = false;
  let lastSampleAt = null;
  let arrowsMissing = false, missingSince = null, facingSince = null;
  let lastVisibilityAt = -Infinity;
  let frustum, projection;

  function facingRoute() {
    // Use independent, fresh compass evidence; never assume the user faces the route.
    const heading = window.FplacesOrientationCompass?.getRawCompassHeading?.(HEADING_MAX_AGE_MS);
    const bearing = window.__fplacesNavigator?.getTargetBearingDegrees?.();
    if (!Number.isFinite(heading) || !Number.isFinite(bearing)) return false;
    return Math.abs(((heading - bearing + 540) % 360) - 180) <= FACING_TOLERANCE_DEG;
  }
  function trackingReady(now) {
    return status === 'NORMAL' && lastSampleAt != null && now - lastSampleAt <= 3000;
  }
  function sessionReady() {
    const nav = window.__fplacesNavigator;
    return !!(nav?.route?.pathCoordinates?.length && !nav.arrived && window.__fplacesXrScene &&
      window.__fplacesXrCamera && window.FplacesCameraStart?.isStarted?.() && !window.__fplacesLiveViewParked);
  }
  function updateLabel() {
    const now = performance.now();
    const facing = facingRoute();
    if (facing) facingSince ??= now;
    else facingSince = null;
    const show = (needsManual || arrowsMissing) && sessionReady() && trackingReady(now) &&
      facing && now - facingSince >= FACING_STABLE_MS;
    const button = window.document?.getElementById('fplaces-calibrate-btn');
    if (!button) return;
    button.hidden = !show;
    // A reused iframe/button may retain legacy inline hiding after park/recovery.
    if (button.style) { button.style.display = ''; button.style.visibility = 'visible'; button.style.opacity = '1'; }
    button.textContent = 'Align route';
    button.title = 'Facing the route. Tap to realign arrows at your current route progress.';
  }
  function invalidate(reason) {
    if (window.FplacesTrailDiagnostics?.enabled) window.FplacesTrailDiagnostics.record('alignment-invalidated', { reason, trackingStatus: status });
    const alreadyInvalid = needsManual && !window.FplacesAnchorEngine?.isCalibrated;
    needsManual = true; arrowsMissing = false; missingSince = null;
    if (!alreadyInvalid) {
      window.FplacesAnchorEngine?.reset?.();
      window.FplacesWorldRoute?.invalidate?.(reason);
      window.FplacesSlamPose?.deactivate?.();
    }
    updateLabel();
    window.FplacesLiveViewHud?.setStatus?.(reason + ' Face the route; when tracking recovers, tap Align route.');
  }
  function observe(next) {
    if (next !== 'NORMAL' && next !== 'LIMITED') return;
    lastSampleAt = performance.now();
    if (next === 'LIMITED' && status !== 'LIMITED' &&
        (status === 'NORMAL' || window.FplacesAnchorEngine?.isCalibrated)) invalidate('Tracking interrupted.');
    status = next;
    // Heading can change while tracking status remains NORMAL.
    updateLabel();
  }
  window.FplacesSpatialAlignment = {
    observe, invalidate, facingRoute,
    syncButton: updateLabel,
    canCalibrate(manual) {
      this.checkFreshness();
      return sessionReady() && trackingReady(performance.now()) && (!needsManual || manual === true) &&
        (manual !== true || facingRoute());
    },
    calibrated() { needsManual = false; arrowsMissing = false; missingSince = null; updateLabel(); },
    observeArrowVisibility(visible, now = performance.now()) {
      const nav = window.__fplacesNavigator;
      const remaining = nav?.distanceRemainingToDestinationMeters?.();
      // Looking away and intentional arrival clearing are not alignment failures.
      if (!sessionReady() || !trackingReady(now) || !window.FplacesAnchorEngine?.isCalibrated ||
          !facingRoute() || (Number.isFinite(remaining) && remaining <= (window.FPLACES_AR_CONFIG?.arrivalClearRemainingM ?? 1.8))) {
        missingSince = null; arrowsMissing = false;
      } else if (visible) {
        missingSince = null; arrowsMissing = false;
      } else {
        missingSince ??= now;
        arrowsMissing = now - missingSince >= MISSING_ARROW_MS;
      }
      updateLabel();
    },
    sampleArrowVisibility(camera, group, now) {
      if (now - lastVisibilityAt < 200) return;
      lastVisibilityAt = now;
      const T = window.THREE;
      if (!frustum && T?.Frustum && T?.Matrix4) { frustum = new T.Frustum(); projection = new T.Matrix4(); }
      const canProject = frustum && camera?.projectionMatrix && camera?.matrixWorldInverse;
      if (canProject) {
        camera.updateMatrixWorld();
        frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      }
      const visible = group?.visible !== false && (group?.children || []).some(child => {
        if (!child.visible) return false;
        if (canProject) child.updateWorldMatrix(true, true);
        let inView = false;
        child.traverse(object => {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          let effectiveVisible = object.visible !== false;
          for (let ancestor = object.parent; ancestor; ancestor = ancestor.parent) effectiveVisible = effectiveVisible && ancestor.visible !== false;
          if (object.isMesh && effectiveVisible && materials.some(m => m && m.visible !== false && (m.opacity ?? 1) > 0.01) && (!canProject || frustum.intersectsObject(object))) inView = true;
        });
        return inView;
      });
      this.observeArrowVisibility(visible, now);
    },
    checkFreshness() {
      if (window.FplacesAnchorEngine?.isCalibrated && lastSampleAt != null && performance.now() - lastSampleAt > 3000) {
        status = 'UNKNOWN'; invalidate('Tracking unavailable.');
      }
    },
    get status() { return status; },
    get needsManual() { return needsManual; },
    get needsControl() { return needsManual || arrowsMissing; },
    diagnosticSnapshot() {
      return { status, needsManual, arrowsMissing, facingRoute: facingRoute(), sampleAgeMs: lastSampleAt == null ? null : performance.now() - lastSampleAt };
    },
  };
})();
