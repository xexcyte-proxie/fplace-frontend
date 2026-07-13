/**
 * User-gesture gate for camera + motion sensors (required in iframe / iOS).
 */
(function () {
  const SLOG = () => window.FplacesSlamDiagnostics;
  let pendingCallback = null;
  let started = false;
  let starting = false;

  function getLayer() {
    return document.getElementById('camera-start-layer');
  }

  function getCopy() {
    return document.getElementById('camera-start-copy');
  }

  function getButton() {
    return document.getElementById('lv-start-btn');
  }

  async function requestMotionPermission() {
    if (typeof DeviceOrientationEvent?.requestPermission !== 'function') {
      return true;
    }
    try {
      const state = await DeviceOrientationEvent.requestPermission();
      return state === 'granted';
    } catch {
      return false;
    }
  }

  function showLayer(message) {
    const layer = getLayer();
    const copy = getCopy();
    const btn = getButton();
    if (!layer || !btn) return;

    window.__fplacesAwaitingCameraStart = true;
    layer.classList.remove('hidden');
    layer.setAttribute('aria-hidden', 'false');
    if (copy) copy.textContent = message || 'Tap Start to enable camera';
    btn.disabled = false;
    btn.textContent = 'Start Live View';

    document.getElementById('live-nav')?.classList.add('hidden');
    document.getElementById('trip-footer')?.classList.add('hidden');
    document.body.classList.remove('lv-active');
    window.FplacesArDebug?.log('Camera', 'Showing start layer', { message });
  }

  function hideLayer() {
    window.__fplacesAwaitingCameraStart = false;
    const layer = getLayer();
    layer?.classList.add('hidden');
    layer?.setAttribute('aria-hidden', 'true');
    document.getElementById('status')?.classList.add('hidden');
  }

  function markStarted() {
    started = true;
    pendingCallback = null;
    hideLayer();
  }

  async function requestSensorsAfterCamera() {
    await requestMotionPermission();
    const granted = await window.FplacesOrientationCompass?.requestHeadingPermission?.();
    if (granted) window.FplacesOrientationCompass?.bindHeading?.();
  }

  function startPreviewCamera() {
    return window.FplacesFallbackNav.attachCamera();
  }

  async function ensurePreviewCamera() {
    const video = document.getElementById('camera');
    if (video?.srcObject) return true;
    try {
      await startPreviewCamera();
      return true;
    } catch (error) {
      window.FplacesArDebug?.warn('Camera', 'Preview camera failed', {
        error: String(error),
      });
      return false;
    }
  }

  function releasePreviewStream() {
    const video = document.getElementById('camera');
    if (!video?.srcObject) return;
    const stream = video.srcObject;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => track.stop());
    }
    video.srcObject = null;
  }

  function isMobileHandset() {
    return window.FplacesFallbackNav?.isMobileHandset?.() ??
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
  }

  function startXrFromGesture(cb) {
    let xrAttempts = 0;
    const btn = getButton();
    const runXr = async () => {
      xrAttempts += 1;
      if (xrAttempts > 500) {
        SLOG()?.log?.('camera', 'SLAM engine not ready after wait', {
          attempts: xrAttempts,
        });
        showLayer('SLAM failed to load — tap Start to try compass mode');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Start Live View';
        }
        starting = false;
        return;
      }
      if (typeof window.__fplacesRunXrEngine !== 'function') {
        if (btn) btn.textContent = 'Loading SLAM…';
        window.setTimeout(runXr, 40);
        return;
      }
      if (!window.__fplacesXrPipelineReady) {
        if (btn) btn.textContent = 'Loading SLAM…';
        window.setTimeout(runXr, 40);
        return;
      }
      if (btn) btn.textContent = 'Starting camera…';
      window.__fplacesDesktopSlamMode = !isMobileHandset();
      window.__fplacesKeepPreviewDuringSlam = false;
      window.__fplacesDesktopDevMode = window.__fplacesDesktopSlamMode;
      document.body.classList.remove('lv-slam-preview-visible');

      const video = document.getElementById('camera');
      if (video?.srcObject) {
        releasePreviewStream();
      }
      if (video) video.style.display = 'none';

      if (window.__fplacesDesktopSlamMode) {
        window.FplacesLiveViewHud?.setStatus?.(
          'Mac desktop — SLAM via XR8 (one camera). Test on iPhone for production camera.',
        );
      }
      try {
        const result = cb();
        if (result === 'xr-run') {
          window.__fplacesXrAwaitingOnStart = true;
          window.FplacesArDebug?.log('Camera', 'XR8.run() invoked');
          SLOG()?.log?.('camera', 'XR8.run() invoked — waiting for XR camera feed');
          requestSensorsAfterCamera().catch(() => {});
        }
      } catch (error) {
        window.FplacesArDebug?.warn('Camera', 'XR8.run failed', {
          error: String(error),
        });
        showLayer('AR failed to start — tap Start to retry');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Start Live View';
        }
      }
      starting = false;
    };
    runXr();
  }

  function handleStart(source) {
    if (started || starting || !pendingCallback) return;
    starting = true;
    const btn = getButton();
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Starting…';
    }
    window.FplacesArDebug?.log('Camera', 'Start tapped', { source, syncXr: !!window.__fplacesXrSyncStart });
    SLOG()?.logCheck?.('start-tap', true, `Start tapped (${source})`, {
      syncXr: !!window.__fplacesXrSyncStart,
    });

    const cb = pendingCallback;

    try {
      if (window.__fplacesXrSyncStart) {
        // XR8 owns the camera on mobile — do not open a preview stream first.
        startXrFromGesture(cb);
        return;
      }

      Promise.resolve(cb())
        .then(() => {
          document.body.classList.add('lv-compass-camera');
          markStarted();
          window.FplacesArDebug?.log('Camera', 'Preview camera started');
          SLOG()?.logCheck?.('preview-camera', true, 'Preview getUserMedia camera attached', {
            tracks: document.getElementById('camera')?.srcObject?.getVideoTracks?.()?.length,
          });
          SLOG()?.runHealthCheck?.('preview-camera-started');
          window.__fplacesOnCameraStarted?.();
          requestSensorsAfterCamera().catch(() => {});
        })
        .catch((error) => {
          window.FplacesArDebug?.warn('Camera', 'Camera start failed', { error: String(error) });
          showLayer('Camera blocked — allow access in Settings, then tap Start again');
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Start Live View';
          }
        })
        .finally(() => {
          starting = false;
        });
      return;
    } catch (error) {
      window.FplacesArDebug?.warn('Camera', 'XR start failed', { error: String(error) });
      SLOG()?.log?.('camera', 'XR start failed', { error: String(error) });
      SLOG()?.audit?.('camera-xr-error');
      showLayer('AR failed to start — tap Start to retry');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Start Live View';
      }
      starting = false;
    }
  }

  function bindStartControls() {
    const btn = getButton();
    const layer = getLayer();
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';

    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleStart('button');
    });

    layer?.addEventListener('click', (event) => {
      if (event.target === layer) handleStart('layer');
    });
  }

  function showPrompt(message, onStart, options) {
    bindStartControls();
    if (started) {
      onStart?.();
      return;
    }
    pendingCallback = onStart;
    window.__fplacesXrSyncStart = !!(options && options.syncXr);
    window.__fplacesExpectSlam = !!window.__fplacesXrSyncStart;
    if (window.__fplacesXrSyncStart) {
      window.__fplacesSlamRequested = true;
    }
    SLOG()?.log?.('camera', 'Camera prompt shown', {
      syncXr: window.__fplacesXrSyncStart,
      message,
    });
    const copy = getCopy();
    const layer = getLayer();
    const btn = getButton();
    if (layer && !layer.classList.contains('hidden')) {
      window.__fplacesAwaitingCameraStart = true;
      if (copy) copy.textContent = message || 'Tap Start to enable camera';
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Start Live View';
      }
      return;
    }
    showLayer(message);
  }

  function stopPreviewCamera() {
    const video = document.getElementById('camera');
    if (!video) return;
    const stream = video.srcObject;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => track.stop());
    }
    video.srcObject = null;
    video.style.display = 'none';
  }

  window.FplacesCameraStart = {
    showPrompt,
    hidePrompt: hideLayer,
    markStarted,
    isStarted() {
      return started;
    },
    isAwaiting() {
      return !!window.__fplacesAwaitingCameraStart;
    },
    isXrAwaitingOnStart() {
      return !!window.__fplacesXrAwaitingOnStart;
    },
    resetForXrRetry() {
      started = false;
      starting = false;
      pendingCallback = null;
      window.__fplacesXrSyncStart = true;
      window.__fplacesXrAwaitingOnStart = false;
      window.__fplacesAwaitingCameraStart = false;
      SLOG()?.log?.('camera', 'Reset for XR retry');
    },
    showLoading(message) {
      bindStartControls();
      const btn = getButton();
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Loading…';
      }
      showLayer(message || 'Loading…');
    },
    stopPreviewCamera,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindStartControls);
  } else {
    bindStartControls();
  }
})();
