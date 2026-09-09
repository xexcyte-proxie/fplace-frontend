/**
 * User-gesture gate for camera + motion sensors (required in iframe / iOS).
 */
(function () {
  const SLOG = () => window.FplacesSlamDiagnostics;
  let pendingCallback = null;
  let started = false;
  let starting = false;
  let startWatchdog = null;
  const XR_START_WATCHDOG_MS = 8000;

  function getLayer() {
    return document.getElementById('camera-start-layer');
  }

  function getCopy() {
    return document.getElementById('camera-start-copy');
  }

  function getTitle() {
    return document.getElementById('camera-start-title');
  }

  function getButton() {
    return document.getElementById('lv-start-btn');
  }

  const CAMERA_HANDOFF_KEY = 'fplaces.handoff.cameraGranted';
  const CAMERA_CHOICE_KEY = 'fplaces.permissionChoice.camera';

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

  async function queryCameraPermission() {
    if (!navigator.permissions?.query) return 'prompt';
    try {
      const status = await navigator.permissions.query({ name: 'camera' });
      return status.state || 'prompt';
    } catch {
      return 'prompt';
    }
  }

  function persistCameraGranted(granted) {
    try {
      if (granted) sessionStorage.setItem(CAMERA_HANDOFF_KEY, '1');
      else sessionStorage.removeItem(CAMERA_HANDOFF_KEY);
    } catch {
      /* private mode */
    }
    try {
      localStorage.setItem(CAMERA_CHOICE_KEY, granted ? 'granted' : 'denied');
    } catch {
      /* private mode */
    }
  }

  function storedCameraChoice() {
    try {
      return localStorage.getItem(CAMERA_CHOICE_KEY);
    } catch {
      return null;
    }
  }

  function clearStartWatchdog() {
    if (!startWatchdog) return;
    window.clearTimeout(startWatchdog);
    startWatchdog = null;
  }

  function armStartWatchdog() {
    clearStartWatchdog();
    startWatchdog = window.setTimeout(() => {
      if (started) return;
      starting = false;
      showLayer('Camera needs a tap — tap Start to open it.');
    }, XR_START_WATCHDOG_MS);
  }

  function shouldAutoStartCamera() {
    if (window.__fplacesCameraPermissionGranted) return true;
    const cfg = window.FPLACES_AR_CONFIG || {};
    if (cfg.cameraReady) return true;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('cameraReady') === '1' || params.get('cameraReady') === 'true') {
        return true;
      }
    } catch {
      /* ignore */
    }
    try {
      if (sessionStorage.getItem(CAMERA_HANDOFF_KEY) === '1') return true;
    } catch {
      /* ignore */
    }
    return storedCameraChoice() === 'granted';
  }

  function applyParentPermissions(data) {
    const camera = data && data.camera;
    if (camera === 'granted') {
      window.__fplacesCameraPermissionGranted = true;
      persistCameraGranted(true);
      // XR8.run() needs a tap inside this iframe — do not auto-start AR.
      if (pendingCallback && !started && !starting) {
        handleStart('parent');
      }
      return;
    }
    if (camera === 'denied') {
      persistCameraGranted(false);
      window.__fplacesCameraPermissionGranted = false;
      if (!started) {
        showLayer('Camera blocked - allow access in Settings, then tap Start again');
      }
    }
  }

  function showLayer(message) {
    const layer = getLayer();
    const copy = getCopy();
    const btn = getButton();
    if (!layer || !btn) return;

    window.__fplacesAwaitingCameraStart = true;
    document.body.classList.add('lv-awaiting-camera');
    layer.classList.remove('hidden');
    layer.setAttribute('aria-hidden', 'false');
    const title = getTitle();
    if (title) title.textContent = 'Start Live View';
    if (copy) copy.textContent = message || 'Hold your phone up and tap Start to open the camera.';
    btn.disabled = false;
    btn.textContent = 'Start Live View';

    document.getElementById('live-nav')?.classList.add('hidden');
    document.getElementById('trip-footer')?.classList.add('hidden');
    document.getElementById('status')?.classList.add('hidden');
    document.getElementById('tracking-mode-badge')?.classList.add('hidden');
    document.getElementById('scan-overlay')?.classList.add('hidden');
    document.body.classList.remove('lv-active');
    window.FplacesArDebug?.log('Camera', 'Showing start layer', { message });
  }

  function hideLayer() {
    window.__fplacesAwaitingCameraStart = false;
    document.body.classList.remove('lv-awaiting-camera');
    const layer = getLayer();
    layer?.classList.add('hidden');
    layer?.setAttribute('aria-hidden', 'true');
    document.getElementById('status')?.classList.add('hidden');
  }

  function showLoading(message) {
    bindStartControls();
    const layer = getLayer();
    const copy = getCopy();
    const btn = getButton();
    if (!layer) return;
    window.__fplacesAwaitingCameraStart = true;
    document.body.classList.add('lv-awaiting-camera');
    layer.classList.remove('hidden');
    layer.setAttribute('aria-hidden', 'false');
    const title = getTitle();
    if (title) title.textContent = 'Starting Live View';
    if (copy) copy.textContent = message || 'Hold still while the camera opens.';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Starting camera…';
    }
    document.getElementById('live-nav')?.classList.add('hidden');
    document.getElementById('trip-footer')?.classList.add('hidden');
    document.getElementById('status')?.classList.add('hidden');
    document.getElementById('tracking-mode-badge')?.classList.add('hidden');
    document.getElementById('scan-overlay')?.classList.add('hidden');
  }

  function markStarted() {
    clearStartWatchdog();
    started = true;
    pendingCallback = null;
    persistCameraGranted(true);
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
        window.__fplacesXrSyncStart = false;
        window.__fplacesForceCompassOnStart = true;
        pendingCallback = () => window.FplacesFallbackNav.attachCamera();
        showLayer('AR could not start — tap to use compass mode');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Start compass';
        }
        starting = false;
        return;
      }
      if (typeof window.__fplacesRunXrEngine !== 'function') {
        if (btn) btn.textContent = 'Starting AR…';
        window.setTimeout(runXr, 40);
        return;
      }
      if (!window.__fplacesXrPipelineReady) {
        if (btn) btn.textContent = 'Starting AR…';
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
          'Desktop preview — test on iPhone for the real camera.',
        );
      }
      try {
        const result = cb();
        if (result === 'xr-run') {
          window.__fplacesXrAwaitingOnStart = true;
          clearStartWatchdog();
          window.FplacesArDebug?.log('Camera', 'XR8.run() invoked');
          SLOG()?.log?.('camera', 'XR8.run() invoked - waiting for XR camera feed');
          requestSensorsAfterCamera().catch(() => {});
        }
      } catch (error) {
        window.FplacesArDebug?.warn('Camera', 'XR8.run failed', {
          error: String(error),
        });
        showLayer('AR failed to start - tap Start to retry');
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
    showLoading('Hold still while the camera opens.');
    window.FplacesArDebug?.log('Camera', 'Start tapped', { source, syncXr: !!window.__fplacesXrSyncStart });
    SLOG()?.logCheck?.('start-tap', true, `Start tapped (${source})`, {
      syncXr: !!window.__fplacesXrSyncStart,
    });

    const cb = pendingCallback;

    try {
      if (window.__fplacesXrSyncStart) {
        // XR8 owns the camera on mobile - do not open a preview stream first.
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
          if (window.__fplacesForceCompassOnStart) {
            window.__fplacesForceCompassOnStart = false;
            window.__fplacesStartFallback?.('SLAM engine failed to load');
          }
        })
        .catch((error) => {
          persistCameraGranted(false);
          window.__fplacesCameraPermissionGranted = false;
          window.FplacesArDebug?.warn('Camera', 'Camera start failed', { error: String(error) });
          showLayer('Camera blocked - allow access in Settings, then tap Start again');
        })
        .finally(() => {
          starting = false;
        });
      return;
    } catch (error) {
      window.FplacesArDebug?.warn('Camera', 'XR start failed', { error: String(error) });
      SLOG()?.log?.('camera', 'XR start failed', { error: String(error) });
      SLOG()?.audit?.('camera-xr-error');
      showLayer('AR failed to start - tap Start to retry');
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

  function tryAutoStart(reason) {
    if (started || starting || !pendingCallback) return false;
    if (window.__fplacesXrSyncStart) return false;
    showLoading('Starting Live View…');
    handleStart(reason);
    return true;
  }

  async function tryAutoStartFromPermission(fallbackMessage) {
    if (started || starting) return;
    if (shouldAutoStartCamera()) {
      tryAutoStart('auto');
      return;
    }
    const state = await queryCameraPermission();
    if (started || starting) return;
    if (state === 'granted') {
      window.__fplacesCameraPermissionGranted = true;
      persistCameraGranted(true);
      tryAutoStart('permission-api');
      return;
    }
    if (state === 'denied' || storedCameraChoice() === 'denied') {
      persistCameraGranted(false);
      showLayer('Camera blocked - allow access in Settings, then tap Start again');
      return;
    }
    showLayer(fallbackMessage);
  }

  function showPrompt(message, onStart, options) {
    bindStartControls();
    if (started) {
      onStart?.();
      return;
    }
    if (starting) return;
    if (onStart) pendingCallback = onStart;
    window.__fplacesXrSyncStart = !!(options && options.syncXr);
    window.__fplacesExpectSlam = !!window.__fplacesXrSyncStart;
    if (window.__fplacesXrSyncStart) {
      window.__fplacesSlamRequested = true;
    }
    SLOG()?.log?.('camera', 'Camera prompt shown', {
      syncXr: window.__fplacesXrSyncStart,
      message,
      autoStart: shouldAutoStartCamera(),
    });

    if (shouldAutoStartCamera()) {
      // XR mode needs a real user gesture, so tryAutoStart refuses when
      // syncXr is set. Fall through to the visible Start button instead of
      // leaving the page stuck on "Starting AR…" with no prompt.
      if (tryAutoStart('auto')) return;
    }

    if (storedCameraChoice() === 'denied') {
      showLayer('Camera blocked - allow access in Settings, then tap Start again');
      return;
    }

    showLayer(message || 'Hold your phone up and tap Start to open the camera.');
    void tryAutoStartFromPermission(
      message || 'Hold your phone up and tap Start to open the camera.',
    );
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
    applyParentPermissions,
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
      clearStartWatchdog();
      window.__fplacesXrSyncStart = true;
      window.__fplacesXrAwaitingOnStart = false;
      window.__fplacesAwaitingCameraStart = false;
      document.body.classList.remove('lv-awaiting-camera');
      SLOG()?.log?.('camera', 'Reset for XR retry');
    },
    showLoading(message) {
      showLoading(message || 'Loading…');
    },
    stopPreviewCamera,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindStartControls);
  } else {
    bindStartControls();
  }
})();
