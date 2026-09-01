/**
 * Watches camera lighting while SLAM is active and offers compass mode.
 */
(function () {
  const SAMPLE_MS = 250;
  const SAMPLE_OK_MS = 1200;
  let timer = null;
  let tracker = null;
  let lastTickAt = 0;
  let lastSampleAt = 0;

  function cfgThresholds() {
    const cfg = window.FPLACES_AR_CONFIG || {};
    return {
      darkLuma: cfg.poorLightingDarkLuma,
      dimLuma: cfg.poorLightingDimLuma,
      lowContrast: cfg.poorLightingLowContrast,
    };
  }

  function enabled() {
    const cfg = window.FPLACES_AR_CONFIG || {};
    return cfg.poorLightingPrompt !== false;
  }

  function inSlamMode() {
    return (
      window.__fplacesArMode === 'slam' &&
      !document.body.classList.contains('lv-compass-camera')
    );
  }

  function tick() {
    if (!enabled() || !tracker) return;
    const now = performance.now();
    if (now - lastTickAt < SAMPLE_MS) return;
    lastTickAt = now;
    if (window.FplacesCameraStart?.isAwaiting?.()) return;
    if (!window.__fplacesCameraSessionNotified) return;
    if (!inSlamMode()) return;
    if (window.FplacesLightingCompassPrompt?.isOpen?.()) return;

    const nowOk = tracker.isLightingOkLocked?.(now) === true;
    const minGap = nowOk ? SAMPLE_OK_MS : SAMPLE_MS;
    if (now - lastSampleAt < minGap && lastSampleAt > 0) return;
    lastSampleAt = now;

    const sample = window.FplacesCameraLumaSampler?.sample?.() || null;
    const result = tracker.ingest(sample, now);
    if (result.shouldSwitch) {
      window.FplacesLightingCompassPrompt?.hide?.();
      window.__fplacesStartFallback?.(
        'Too dark for camera AR — compass guidance',
      );
    }
  }

  function start() {
    if (!enabled()) return;
    const quality = window.FplacesVisualTrackingQuality;
    if (!quality) return;
    tracker = quality.createLightingTracker(cfgThresholds());
    tracker.start(performance.now());
    if (timer != null) window.clearInterval(timer);
    timer = window.setInterval(tick, SAMPLE_MS);
    window.FplacesArDebug?.log('LightingMonitor', 'Started poor-lighting watch');
  }

  function stop() {
    if (timer != null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  window.FplacesVisualTrackingMonitor = {
    start,
    stop,
    tick,
    dismiss() {
      tracker?.dismiss(performance.now());
    },
    markSwitched() {
      tracker?.markSwitched();
      stop();
    },
  };
})();
