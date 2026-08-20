/**
 * Bootstraps 8th Wall XR or fallback mode after route is available.
 */
(function () {
  const cfg = window.FPLACES_AR_CONFIG || {};
  const DBG = () => window.FplacesArDebug;
  const SLOG = () => window.FplacesSlamDiagnostics;
  const navigatorInstance = new window.FplacesRouteNavigator();
  window.__fplacesNavigator = navigatorInstance;

  let started = false;
  let activeMode = null;
  let xrWaitTimer = null;
  let xrPollCount = 0;
  let xrSceneStarted = false;

  function resolveXrMode() {
    const mode = cfg.xrMode || 'auto';
    let resolved;
    if (mode === 'fallback') resolved = 'fallback';
    else if (mode === 'platform') {
      const hasKey = !!(cfg.eighthWallAppKey || '').trim();
      resolved = hasKey ? 'platform' : 'binary';
    } else if (mode === 'auto' && !window.isSecureContext) resolved = 'fallback';
    else resolved = 'binary';

    SLOG()?.log?.('resolveXrMode', `Resolved mode: ${resolved}`, {
      configMode: mode,
      isSecureContext: window.isSecureContext,
      reason:
        resolved === 'fallback' && mode !== 'fallback'
          ? 'HTTP/non-secure context - SLAM requires HTTPS'
          : null,
    });
    return resolved;
  }

  function xrScriptsAlreadyInjected() {
    if (window.__fplacesXrScriptsInjected) return true;
    const bootstrap = document.getElementById('xr-bootstrap');
    if (bootstrap?.dataset?.loaded === 'true') return true;
    // Scripts may still be loading (THREE/XR8 not defined yet) - check tags.
    if (document.querySelector('script[data-fplaces-xr], script[src*="three@0.160.0"], script[src*="engine-binary"]')) {
      return true;
    }
    return !!(window.THREE && window.XR8);
  }

  function injectXrScripts(mode) {
    const bootstrap = document.getElementById('xr-bootstrap');

    if (mode === 'fallback') {
      if (bootstrap) bootstrap.dataset.loaded = 'true';
      DBG()?.log('Bootstrap', 'Skipping XR script injection (fallback mode)');
      return;
    }

    if (xrScriptsAlreadyInjected()) {
      window.__fplacesXrScriptsInjected = true;
      if (bootstrap) bootstrap.dataset.loaded = 'true';
      DBG()?.log('Bootstrap', 'XR scripts already present - skip re-inject', {
        hasTHREE: !!window.THREE,
        hasXR8: !!window.XR8,
      });
      return;
    }

    window.__fplacesXrScriptsInjected = true;
    if (bootstrap) bootstrap.dataset.loaded = 'true';

    DBG()?.log('Bootstrap', 'Injecting XR scripts', { mode });

    const three = document.createElement('script');
    three.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
    three.dataset.fplacesXr = 'three';
    three.onload = () => {
      DBG()?.log('Bootstrap', 'THREE.js loaded');
      SLOG()?.log?.('scripts', 'THREE.js loaded');
    };
    three.onerror = () => {
      DBG()?.error('Bootstrap', 'THREE.js failed to load');
      SLOG()?.log?.('scripts', 'THREE.js failed to load');
    };
    document.head.appendChild(three);

    const extras = document.createElement('script');
    extras.src = 'https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js';
    extras.crossOrigin = 'anonymous';
    extras.dataset.fplacesXr = 'xrextras';
    extras.onload = () => {
      DBG()?.log('Bootstrap', 'XRExtras loaded');
      SLOG()?.log?.('scripts', 'XRExtras loaded');
    };
    extras.onerror = () => {
      DBG()?.error('Bootstrap', 'XRExtras failed to load');
      SLOG()?.log?.('scripts', 'XRExtras failed to load');
    };
    document.head.appendChild(extras);

    const xr = document.createElement('script');
    xr.async = true;
    xr.dataset.fplacesXr = 'xr8';
    if (mode === 'platform') {
      xr.src = `https://apps.8thwall.com/xrweb?appKey=${encodeURIComponent(cfg.eighthWallAppKey)}`;
    } else {
      xr.src = 'https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr.js';
      xr.crossOrigin = 'anonymous';
      xr.dataset.preloadChunks = 'slam';
    }
    xr.onload = () => {
      DBG()?.log('Bootstrap', 'XR8 script tag onload', { src: xr.src });
      SLOG()?.log?.('scripts', 'XR8 script loaded', { src: xr.src });
    };
    xr.onerror = () => {
      DBG()?.error('Bootstrap', 'XR8 script failed to load', { src: xr.src });
      SLOG()?.log?.('scripts', 'XR8 script failed to load', { src: xr.src });
    };
    document.head.appendChild(xr);
  }

  function startFallback(reason) {
    if (activeMode === 'fallback') return;
    const keepPreview = (() => {
      const video = document.getElementById('camera');
      return !!(video?.srcObject && window.FplacesCameraStart?.isStarted?.());
    })();
    window.__fplacesFallbackTriggered = true;
    window.__fplacesFallbackReason = reason || '';
    window.__fplacesExpectSlam = false;
    if (activeMode === 'xr') {
      DBG()?.warn('Bootstrap', 'XR error - switching to compass', {
        reason,
        keepPreview,
      });
      try {
        window.XR8?.stop?.();
      } catch (_) {}
    }
    if (activeMode != null && activeMode !== 'xr' && !keepPreview) return;
    activeMode = 'fallback';
    window.__fplacesArMode = 'compass';
    DBG()?.warn('Bootstrap', 'Starting FALLBACK mode', { reason, keepPreview });
    SLOG()?.log?.('fallback', `SLAM skipped - fallback mode: ${reason}`, { reason, keepPreview });
    SLOG()?.audit?.('fallback');
    if (xrWaitTimer) {
      clearTimeout(xrWaitTimer);
      xrWaitTimer = null;
    }
    try {
      window.XR8?.stop?.();
    } catch (_) {}
    document.getElementById('camerafeed')?.remove();
    document.body.classList.remove('lv-compass-camera');
    window.FplacesSlamHeading?.deactivate?.();
    window.FplacesSlamPose?.deactivate?.();
    window.FplacesOrientationCompass?.setWebGlActive?.(false);
    window.FplacesArCalibrationUi?.inject?.();
    window.FplacesOrientationCompass?.start?.();
    window.FplacesOrientationCompass?.attachNavigator?.(navigatorInstance);
    window.FplacesFallbackNav.start({ navigator: navigatorInstance });
    window.FplacesLiveViewHud?.setTrackingMode?.(
      'compass',
      reason ? `Compass: ${reason.slice(0, 48)}` : 'Compass only',
    );
    document.body.classList.add('lv-compass-camera');
    if (keepPreview) {
      const video = document.getElementById('camera');
      const tracks = video?.srcObject?.getVideoTracks?.() || [];
      const live = tracks.some((track) => track.readyState === 'live');
      document.body.classList.add('lv-compass-camera');
      if (live && video) {
        window.FplacesFallbackNav?.showPreviewVideo?.();
        window.__fplacesOnCameraStarted?.();
        return;
      }
      window.FplacesFallbackNav.attachCamera()
        .then(() => {
          window.FplacesCameraStart?.markStarted?.();
          window.__fplacesOnCameraStarted?.();
        })
        .catch((error) => {
          DBG()?.warn('Bootstrap', 'Could not restore preview camera after XR error', {
            error: String(error),
          });
          promptForCamera('Tap Start to enable camera (compass mode)', { syncXr: false });
        });
      return;
    }
    promptForCamera('Tap Start to enable camera (compass mode)', { syncXr: false });
  }

  window.__fplacesStartFallback = startFallback;

  function markCompassFallback(reason) {
    activeMode = 'fallback';
    window.__fplacesArMode = 'compass';
    window.__fplacesExpectSlam = false;
    window.FplacesSlamHeading?.deactivate?.();
    window.FplacesSlamPose?.deactivate?.();
    window.FplacesOrientationCompass?.setWebGlActive?.(false);
    SLOG()?.log?.('fallback', `Compass mode: ${reason}`, { reason });
  }

  window.__fplacesMarkCompassFallback = markCompassFallback;

  function resetPrematureFallback() {
    if (!window.__fplacesFallbackTriggered) return false;
    if (window.__fplacesXrRunCalled || window.__fplacesXrSessionActive) return false;

    SLOG()?.log?.('recover', 'Resetting premature fallback - retrying SLAM', {
      reason: window.__fplacesFallbackReason,
    });
    window.__fplacesFallbackTriggered = false;
    window.__fplacesFallbackReason = '';
    activeMode = null;
    xrSceneStarted = false;
    window.__fplacesExpectSlam = true;
    window.FplacesCameraStart?.resetForXrRetry?.();
    return true;
  }

  function tryStartXrAfterPipeline() {
    if (activeMode === 'fallback') return;
    if (!window.__fplacesXrPipelineReady) return;
    if (window.__fplacesXrSessionActive) return;
    if (window.FplacesCameraStart?.isStarted?.()) return;

    promptForCamera('Tap Start to begin floor SLAM', { syncXr: true });
  }

  function promptForCamera(message, options) {
    if (window.FplacesCameraStart?.isStarted?.()) return;
    if (window.__fplacesXrSessionActive) return;
    const syncXr = !!(options && options.syncXr);
    const onStart = syncXr ? startXrFromGesture : startPreviewCamera;
    window.FplacesCameraStart?.showPrompt?.(message, onStart, { syncXr });
  }

  function armXrWait() {
    resetPrematureFallback();

    const xrTimeoutMs = cfg.xrLoadTimeoutMs ?? 25000;
    if (xrWaitTimer) {
      clearTimeout(xrWaitTimer);
      xrWaitTimer = null;
    }
    xrWaitTimer = setTimeout(() => {
      if (activeMode === 'xr' || activeMode === 'fallback') return;
      if (!window.XR8 || !window.THREE) {
        DBG()?.warn('Bootstrap', 'XR8/THREE load timeout', {
          hasXR8: !!window.XR8,
          hasTHREE: !!window.THREE,
          polls: xrPollCount,
        });
        SLOG()?.log?.('timeout', 'XR8/THREE load timeout - falling back', {
          hasXR8: !!window.XR8,
          hasTHREE: !!window.THREE,
          polls: xrPollCount,
        });
        startFallback('SLAM engine failed to load (CDN blocked or slow network).');
      }
    }, xrTimeoutMs);

    const waitForXr = () => {
      resetPrematureFallback();
      if (activeMode === 'fallback') return;
      xrPollCount += 1;
      if (!window.THREE || !window.XR8) {
        if (xrPollCount % 20 === 0) {
          DBG()?.log('Bootstrap', 'Waiting for XR8 + THREE…', {
            polls: xrPollCount,
            hasTHREE: !!window.THREE,
            hasXR8: !!window.XR8,
          });
          SLOG()?.log?.('wait', 'Waiting for XR8 + THREE', {
            polls: xrPollCount,
            hasTHREE: !!window.THREE,
            hasXR8: !!window.XR8,
          });
        }
        setTimeout(waitForXr, 100);
        return;
      }
      if (xrWaitTimer) {
        clearTimeout(xrWaitTimer);
        xrWaitTimer = null;
      }
      beginXrScene();

      const waitPipeline = () => {
        if (activeMode === 'fallback') return;
        if (window.__fplacesXrPipelineReady) {
          onXrPipelineReady();
          return;
        }
        setTimeout(waitPipeline, 50);
      };
      waitPipeline();
    };
    waitForXr();
  }

  function scheduleAutoCalibrate() {
    if (!cfg.autoCalibrate) return;
    const delays = [800, 2000, 4000, 7000, 11000];
    delays.forEach((ms) => {
      window.setTimeout(() => tryAutoCalibrate(`t${ms}`), ms);
    });
  }

  function tryAutoCalibrate(label) {
    if (!cfg.autoCalibrate) return false;
    if (!window.FplacesCameraStart?.isStarted?.()) return false;
    if (!window.__fplacesXrScene) return false;
    const routeReady =
      window.fplacesActiveRoute ||
      navigatorInstance.route?.pathCoordinates?.length;
    if (!routeReady) return false;
    if (typeof window.executeDemoCalibrationFlow !== 'function') return false;

    const alreadyCalibrated = window.FplacesAnchorEngine?.isCalibrated;
    const worldAttached = window.FplacesWorldRoute?.isAttached?.();
    const ribbonReady =
      worldAttached &&
      window.FplacesPathGeometry?.hasRibbon?.(window.__fplacesXrScene);

    if (alreadyCalibrated && ribbonReady) {
      return true;
    }

    if (alreadyCalibrated && worldAttached) {
      window.FplacesWorldRoute?.ensureRibbon?.();
      if (window.FplacesPathGeometry?.hasRibbon?.(window.__fplacesXrScene)) {
        return true;
      }
    }

    window.executeDemoCalibrationFlow();
    DBG()?.log('Bootstrap', 'autoCalibrate executed', {
      label,
      worldAttached,
      alreadyCalibrated,
    });
    return true;
  }

  window.__fplacesTryAutoCalibrate = tryAutoCalibrate;

  function onCameraStarted() {
    DBG()?.log('Bootstrap', 'Camera session active', { activeMode });
    SLOG()?.log?.('camera', 'Camera session started', { activeMode });
    if (activeMode === 'fallback') {
      SLOG()?.audit?.('camera-started-fallback');
      SLOG()?.runHealthCheck?.('camera-started-fallback');
    } else {
      SLOG()?.log?.('camera', 'XR camera session started - awaiting xr-onStart audit');
    }
    window.FplacesOrientationCompass?.start?.();
    window.FplacesOrientationCompass?.attachNavigator?.(navigatorInstance);
    if (activeMode === 'fallback') {
      window.FplacesLiveViewHud?.setTrackingMode?.('compass', 'Compass + camera');
    } else {
      window.FplacesLiveViewHud?.setTrackingMode?.('slam', 'SLAM active');
    }
    scheduleAutoCalibrate();
    tryAutoCalibrate('camera-start');
  }

  window.__fplacesOnCameraStarted = onCameraStarted;

  function startXrFromGesture() {
    if (typeof window.__fplacesRunXrEngine !== 'function') {
      throw new Error('XR engine not ready');
    }
    window.__fplacesRunXrEngine();
    return 'xr-run';
  }

  function startPreviewCamera() {
    return window.FplacesFallbackNav.attachCamera();
  }

  function beginXrScene() {
    if (xrSceneStarted) return;
    xrSceneStarted = true;
    activeMode = 'xr';
    window.__fplacesExpectSlam = true;
    window.__fplacesSlamRequested = true;

    const hud = {
      update(state) {
        window.FplacesLiveViewHud?.update(state, navigatorInstance);
      },
    };
    window.FplacesXrNavScene.start({ navigator: navigatorInstance, hud });
    SLOG()?.log?.('xrScene', 'XR scene bootstrap started');
  }

  function onXrPipelineReady() {
    DBG()?.log('Bootstrap', 'XR pipeline ready');
    SLOG()?.log?.('pipeline', 'XR pipeline ready - waiting for user tap');
    window.FplacesLiveViewHud?.setTrackingMode?.('slam-loading', 'Tap Start for SLAM');
    const copy = document.getElementById('camera-start-copy');
    if (copy) copy.textContent = 'Tap Start to begin floor SLAM';
    tryStartXrAfterPipeline();
  }

  window.__fplacesOnXrPipelineReady = onXrPipelineReady;

  function startExperience() {
    if (started) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('preload') === '1') return;
    started = true;

    DBG()?.log('Bootstrap', 'startExperience()', {
      isSecureContext: window.isSecureContext,
      href: window.location.href,
    });
    SLOG()?.log?.('start', 'Starting AR experience');
    SLOG()?.runHealthCheck?.('bootstrap-start');
    SLOG()?.scheduleAudits?.();

    const route = window.fplacesActiveRoute;
    if (!route) {
      DBG()?.error('Bootstrap', 'No route - cannot start AR');
      window.FplacesLiveViewHud?.setStatus(
        'Generate a route on the map, then open Live View.',
        true,
      );
      return;
    }

    navigatorInstance.setRoute(route);
    window.FplacesRouteBridge?.flushPendingPositions?.();

    resetPrematureFallback();

    const mode = resolveXrMode();
    DBG()?.log('Bootstrap', 'Resolved XR mode', {
      mode,
      xrLoadTimeoutMs: cfg.xrLoadTimeoutMs ?? 25000,
    });
    injectXrScripts(mode);

    if (mode === 'fallback') {
      activeMode = 'fallback';
      window.__fplacesArMode = 'compass';
      window.FplacesArCalibrationUi?.inject?.();
      window.FplacesOrientationCompass?.start?.();
      window.FplacesOrientationCompass?.attachNavigator?.(navigatorInstance);
      window.FplacesFallbackNav.start({ navigator: navigatorInstance });
      promptForCamera('Tap Start to enable camera (compass mode)', { syncXr: false });
      window.FplacesLiveViewHud?.setTrackingMode?.(
        'compass',
        !window.isSecureContext ? 'Need HTTPS for SLAM' : 'Compass mode',
      );
      return;
    }

    window.__fplacesExpectSlam = true;
    window.FplacesLiveViewHud?.setTrackingMode?.('slam-loading', 'Loading SLAM engine…');
    promptForCamera('Tap Start for Live View', { syncXr: true });

    armXrWait();
  }

  let routeWaitTimer = null;

  window.FplacesRouteBridge.onRoute((route) => {
    DBG()?.log('Bootstrap', 'onRoute callback', { hasRoute: !!route, started });
    if (route) {
      if (routeWaitTimer != null) {
        window.clearTimeout(routeWaitTimer);
        routeWaitTimer = null;
      }
      navigatorInstance.setRoute(route);
      window.FplacesRouteBridge?.flushPendingPositions?.();
      if (!started) startExperience();
      else if (resetPrematureFallback()) armXrWait();
      else if (window.FplacesCameraStart?.isStarted?.()) scheduleAutoCalibrate();
    }
  });

  if (cfg.demoSimWalk) {
    window.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp') window.FplacesDemoSim?.nudge?.(2);
      if (event.key === 'ArrowDown') window.FplacesDemoSim?.nudge?.(-2);
    });
  }

  const isPreloadOnly =
    new URLSearchParams(window.location.search).get('preload') === '1';

  if (isPreloadOnly) {
    DBG()?.log('Bootstrap', 'Preload-only session - warming XR scripts');
    injectXrScripts(resolveXrMode());
  } else if (window.fplacesActiveRoute) {
    DBG()?.log('Bootstrap', 'Route already present at boot - starting immediately');
    startExperience();
  } else {
    DBG()?.log('Bootstrap', 'No route at boot - waiting for bridge');
    const mode = resolveXrMode();
    if (window.isSecureContext && mode !== 'fallback') {
      injectXrScripts(mode);
      window.__fplacesExpectSlam = true;
      window.FplacesCameraStart?.showLoading?.('Waiting for route…');
    }
    routeWaitTimer = window.setTimeout(() => {
      if (!window.fplacesActiveRoute && !started) {
        window.FplacesLiveViewHud?.setStatus(
          'Route not received. Close Live View and try again.',
          true,
        );
      }
    }, 8000);
  }

  window.setInterval(() => {
    const nav = window.__fplacesNavigator;
    if (!nav || typeof nav.managePositionSources !== 'function') return;
    nav.managePositionSources();
  }, 1500);
})();
