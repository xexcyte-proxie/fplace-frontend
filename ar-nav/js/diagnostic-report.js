/** AR joins only a development PWA's recorder. Query parameters cannot enable production capture. */
(function () {
  let recorder;
  try { if (window.parent !== window) recorder = window.parent.FplacesNavigationDiagnostics; } catch (_) {}
  if (!recorder?.development) return;
  window.FplacesNavigationDiagnostics = recorder;
  recorder.update('ar-configuration', 'AR.boot', Object.fromEntries(['useGpsProgress','useSlamPoseFusion','xrMode','trailArrowScale','trailMinCameraDepthM','trailCameraFadeM','incrementalPathHorizonM','incrementalPathSpacingM','incrementalPathMaxVisible'].map(k => [k, window.FPLACES_AR_CONFIG?.[k] ?? null])));
  recorder.metadata({ arBuildId: window.FPLACES_AR_CONFIG?.buildId ?? null });
  window.FplacesPhoneDiagnostics = {
    record(level, phase, message) {
      // Do not export arbitrary console details, URLs or exception messages.
      if (phase === 'tracking') recorder.update('tracking', 'SpatialAlignment.observe', { status: message });
      else if (phase === 'xr-tracking-frame') {
        try { recorder.update('tracking', 'XR8.onUpdate', JSON.parse(message)); } catch (_) {}
      } else if (phase === 'xr-pipeline') recorder.record('tracking', phase, { event: message });
    },
    buildReport: () => recorder.export(),
  };
})();
