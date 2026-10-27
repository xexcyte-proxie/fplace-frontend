/** A conservative tracking gate, independent of navigation progress. */
(function () {
  let status = 'UNKNOWN';
  let needsManual = false;
  let lastSampleAt = null;
  function updateLabel() {
    const button = window.document?.getElementById('fplaces-calibrate-btn');
    if (!button) return;
    button.hidden = !needsManual;
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
    if (changed) updateLabel();
  }
  window.FplacesSpatialAlignment = {
    observe, invalidate,
    syncButton: updateLabel,
    canCalibrate(manual) {
      this.checkFreshness();
      return status === 'NORMAL' && (!needsManual || manual === true) && lastSampleAt != null && performance.now() - lastSampleAt <= 3000;
    },
    calibrated() { needsManual = false; updateLabel(); },
    checkFreshness() {
      if (window.FplacesAnchorEngine?.isCalibrated && lastSampleAt != null && performance.now() - lastSampleAt > 3000) {
        status = 'UNKNOWN'; invalidate('Tracking unavailable.');
      }
    },
    get status() { return status; },
    get needsManual() { return needsManual; },
  };
})();
