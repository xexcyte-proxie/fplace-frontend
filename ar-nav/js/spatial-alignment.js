/** A conservative tracking gate, independent of navigation progress. */
(function () {
  let status = 'UNKNOWN';
  let needsManual = false;
  let lastSampleAt = null;
  let arrowsMissing = false;
  let missingSince = null;
  let lastVisibilityAt = -Infinity;
  let frustum, projection;
  function updateLabel() {
    const button = window.document?.getElementById('fplaces-calibrate-btn');
    if (!button) return;
    button.hidden = !(needsManual || arrowsMissing);
    // Clear legacy inline hiding as well as the HTML hidden attribute.
    if (button.style) {
      button.style.display = '';
      button.style.visibility = 'visible';
      button.style.opacity = '1';
    }
    button.textContent = 'Align route';
    button.title = needsManual
      ? (status === 'NORMAL' ? 'Tracking ready. Tap to realign.' : 'Wait for tracking, then tap to realign.')
      : 'Realign the route using the current camera position';
  }
  function invalidate(reason) {
    if (window.FplacesTrailDiagnostics?.enabled) window.FplacesTrailDiagnostics.record("alignment-invalidated", { reason, trackingStatus: status });
    needsManual = true;
    window.FplacesAnchorEngine?.reset?.();
    window.FplacesWorldRoute?.invalidate?.(reason);
    window.FplacesSlamPose?.deactivate?.();
    updateLabel();
    window.FplacesLiveViewHud?.setStatus?.(reason + ' Tap Align route.');
  }
  function observe(next) {
    if (next !== 'NORMAL' && next !== 'LIMITED') return;
    lastSampleAt = performance.now();
    if (next === 'LIMITED' && status !== 'LIMITED' &&
        (status === 'NORMAL' || window.FplacesAnchorEngine?.isCalibrated)) invalidate('Tracking interrupted.');
    const changed = status !== next;
    status = next;
    if (changed) {
      window.FplacesPhoneDiagnostics?.record('log', 'tracking', next);
      updateLabel();
    }
  }
  window.FplacesSpatialAlignment = {
    observe, invalidate,
    syncButton: updateLabel,
    canCalibrate(manual) {
      this.checkFreshness();
      return status === 'NORMAL' && (!needsManual || manual === true) && lastSampleAt != null && performance.now() - lastSampleAt <= 3000;
    },
    calibrated() { window.FplacesNavigationDiagnostics?.update('calibration', 'SpatialAlignment.calibrated', { event: 'calibrated', revision: window.FplacesAnchorEngine?.instance?.revision ?? null }); needsManual = false; arrowsMissing = false; missingSince = null; updateLabel(); },
    observeArrowVisibility(visible, now = performance.now()) {
      if (!window.FplacesAnchorEngine?.isCalibrated || window.__fplacesNavigator?.arrived) {
        missingSince = null;
        arrowsMissing = false;
      } else if (visible) {
        missingSince = null;
        arrowsMissing = false;
      } else {
        missingSince ??= now;
        arrowsMissing = now - missingSince >= 800;
      }
      updateLabel();
    },
    sampleArrowVisibility(camera, group, now) {
      if (now - lastVisibilityAt < 200) return;
      lastVisibilityAt = now;
      const T = window.THREE;
      if (!frustum && T?.Frustum) { frustum = new T.Frustum(); projection = new T.Matrix4(); }
      const canProject = frustum && camera?.projectionMatrix && camera?.matrixWorldInverse;
      if (canProject) {
        camera.updateMatrixWorld();
        frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      }
      const visible = group?.visible !== false && (group?.children || []).some(child => {
        if (!child.visible) return false;
        if (!canProject) return true;
        child.updateWorldMatrix(true, true);
        let inView = false;
        child.traverse(object => { if (object.isMesh && object.visible && frustum.intersectsObject(object)) inView = true; });
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
      return { status, needsManual, arrowsMissing, sampleAgeMs: lastSampleAt == null ? null : performance.now() - lastSampleAt };
    },
  };
})();
