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
  let xrEngineWaitStarted = false;

  function isPreloadIdle() {
    if (window.__fplacesLiveViewRequested) return false;
    return new URLSearchParams(window.location.search).get('preload') === '1';
  }

  function applyLaunchConfig(options) {
    if (!options || typeof options !== 'object') return;
    const cfg = window.FPLACES_AR_CONFIG || (window.FPLACES_AR_CONFIG = {});
    if (options.autoCalibrate) cfg.autoCalibrate = true;
    if (options.preferVenuePositioning) {
      cfg.preferVenuePositioning = true;
      cfg.useGpsProgress = false;
    }
    if (options.useWorldRoute !== false) cfg.useWorldRoute = true;
    if (options.cameraReady) cfg.cameraReady = true;
    if (options.pwaOrigin) cfg.pwaOrigin = options.pwaOrigin;
    window.__fplacesStartXrNow = !!options.startXrNow;
    window.FplacesSpatialAlignment?.syncButton?.();
  }

  function notifyEngineReady() {
    try {
      const cfg = window.FPLACES_AR_CONFIG || {};
      window.parent?.postMessage?.(
        {
          type: 'fplaces_ar_engine_ready',
          buildId: cfg.buildId,
          pipelineReady: !!window.__fplacesXrPipelineReady,
        },
        cfg.pwaOrigin || window.location.origin,
      );
    } catch {
      /* ignore */
    }
  }

  function resetXrRuntimeFlags() {
    window.__fplacesXrRunCalled = false;
    window.__fplacesXrSessionActive = false;
    window.__fplacesXrAwaitingOnStart = false;
    window.__fplacesCameraSessionNotified = false;
    window.__fplacesXrScene = null;
    window.__fplacesXrCamera = null;
    window.__fplacesPreviewFallbackDone = false;
  }

  function parkLiveView() {
    window.__fplacesLiveViewParked = true;
    window.__fplacesLiveViewRequested = false;
    try {
      window.XR8?.stop?.();
    } catch (_) {}
    window.FplacesVisualTrackingMonitor?.markSwitched?.();
    window.FplacesIncrementalPath?.dispose?.(window.__fplacesXrScene);
    window.FplacesWorldRoute?.detach?.();
    window.FplacesPathArrows3d?.detach?.();
    window.FplacesAnchorEngine?.reset?.();
    window.FplacesSlamHeading?.deactivate?.();
    window.FplacesSlamPose?.deactivate?.();
    window.__fplacesResetXrNavScene?.();
    window.FplacesCameraStart?.stopPreviewCamera?.();
    window.FplacesCameraStart?.resetForReuse?.();
    resetXrRuntimeFlags();
    const feed = document.getElementById('camerafeed');
    if (feed) {
      feed.style.visibility = 'hidden';
      feed.style.display = 'none';
    }
    document.body.classList.remove(
      'lv-slam-active',
      'lv-compass-camera',
      'lv-active',
      'lv-slam-preview-visible',
      'lv-awaiting-camera',
    );
    document.getElementById('live-nav')?.classList.add('hidden');
    document.getElementById('trip-footer')?.classList.add('hidden');
    document.getElementById('scan-overlay')?.classList.add('hidden');
    document.getElementById('tracking-mode-badge')?.classList.add('hidden');
    DBG()?.log('Bootstrap', 'Live View parked - engine kept warm');
    SLOG()?.log?.('park', 'Live View parked - XR stopped, scripts kept');
  }

  function resumeAfterPark() {
    resetXrRuntimeFlags();
    window.__fplacesLiveViewParked = false;
    const mode = resolveXrMode();
    if (mode === 'fallback') {
      activeMode = 'xr';
      window.__fplacesArMode = 'slam';
      promptForCamera(
        window.isSecureContext
          ? 'Tap Start to open the camera.'
          : 'AR needs HTTPS. Open this app over https:// then tap Start.',
        { syncXr: false },
      );
      return;
    }
    activeMode = 'xr';
    window.__fplacesExpectSlam = true;
    window.FplacesLiveViewHud?.setTrackingMode?.('slam-loading', 'Starting AR…');
    promptForCamera('Hold your phone up and tap Start to open the camera.', {
      syncXr: true,
    });
    if (window.__fplacesXrPipelineReady) {
      tryStartXrAfterPipeline();
    } else {
      armXrWait();
    }
  }

  function activateLiveView(options) {
    window.FplacesArGuidance?.open();
    applyLaunchConfig(options);
    const wasParked = !!window.__fplacesLiveViewParked;
    window.__fplacesLiveViewRequested = true;
    window.__fplacesLiveViewParked = false;
    window.FplacesArCalibrationUi?.inject?.();
    if (started) {
      if (wasParked) resumeAfterPark();
      return true;
    }
    if (window.fplacesActiveRoute) {
      startExperience();
      return true;
    }
    DBG()?.log('Bootstrap', 'Activate waiting for route');
    return true;
  }

  window.__fplacesActivateLiveView = activateLiveView;
  window.__fplacesParkLiveView = parkLiveView;

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

  function recoverSlamSession(reason) {
    if (window.__fplacesLiveViewParked) return;
    if (!window.__fplacesLiveViewRequested && !window.FplacesCameraStart?.isStarted?.()) {
      return;
    }
    window.FplacesSpatialAlignment?.invalidate?.('Camera recovering.');
    window.FplacesArCalibrationUi?.inject?.();
    window.__fplacesFallbackTriggered = false;
    window.__fplacesExpectSlam = true;
    activeMode = 'xr';
    window.__fplacesArMode = 'slam';
    document.body.classList.remove('lv-compass-camera');
    document.body.classList.add('lv-slam-active', 'lv-active');
    window.FplacesLiveViewHud?.setTrackingMode?.('slam-loading', 'Resuming AR…');
    if (reason) {
      window.FplacesLiveViewHud?.setStatus?.(reason);
    }
    DBG()?.warn('Bootstrap', 'Recovering SLAM (compass is not used)', { reason });
    SLOG()?.log?.('slam-recover', reason || 'Resuming AR', { reason });

    try {
      if (typeof window.XR8?.resume === 'function') {
        window.XR8.resume();
        window.FplacesLiveViewHud?.setTrackingMode?.('slam', 'AR active');
        return;
      }
    } catch (_) {}

    try {
      window.__fplacesRunXrEngine?.();
      return;
    } catch (error) {
      DBG()?.warn('Bootstrap', 'XR resume needs a tap', {
        error: String(error),
        reason,
      });
    }
    promptForCamera('Tap Start to resume AR.', { syncXr: true });
  }

  function pauseSlamForBackground() {
    window.FplacesSpatialAlignment?.invalidate?.('Camera paused.');
    if (window.__fplacesLiveViewParked) return;
    if (activeMode !== 'xr') return;
    try {
      window.XR8?.pause?.();
    } catch (_) {}
  }

  function startFallback(reason) {
    recoverSlamSession(reason || 'AR interrupted - resuming camera');
  }

  window.__fplacesStartFallback = startFallback;
  window.__fplacesRecoverSlam = recoverSlamSession;

  function markCompassFallback(reason) {
    recoverSlamSession(reason || 'AR interrupted - resuming camera');
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
    if (!window.__fplacesLiveViewRequested) return;
    if (activeMode === 'fallback') return;
    if (!window.__fplacesXrPipelineReady) return;
    if (window.__fplacesXrSessionActive) return;
    if (window.FplacesCameraStart?.isStarted?.()) return;

    promptForCamera('Hold your phone up and tap Start to open the camera.', { syncXr: true });
  }

  function promptForCamera(message, options) {
    if (window.FplacesCameraStart?.isStarted?.()) return;
    if (window.__fplacesXrSessionActive) return;
    const syncXr = !!(options && options.syncXr);
    const onStart = syncXr ? startXrFromGesture : startPreviewCamera;
    window.FplacesCameraStart?.showPrompt?.(message, onStart, {
      syncXr,
      startNow: !!window.__fplacesStartXrNow,
    });
  }

  function armXrWait() {
    resetPrematureFallback();

    if (xrEngineWaitStarted) {
      if (window.THREE && window.XR8) {
        if (!xrSceneStarted) beginXrScene();
        if (window.__fplacesXrPipelineReady) onXrPipelineReady();
      }
      return;
    }
    xrEngineWaitStarted = true;

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
        setTimeout(waitForXr, 32);
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
        setTimeout(waitPipeline, 16);
      };
      waitPipeline();
    };
    waitForXr();
  }

  function scheduleAutoCalibrate() {
    if (!(window.FPLACES_AR_CONFIG || cfg).autoCalibrate) return;
    const delays = [800, 2000, 4000, 7000, 11000];
    delays.forEach((ms) => {
      window.setTimeout(() => tryAutoCalibrate(`t${ms}`), ms);
    });
  }

  function tryAutoCalibrate(label) {
    if (!(window.FPLACES_AR_CONFIG || cfg).autoCalibrate) return false;
    if (!window.FplacesCameraStart?.isStarted?.()) return false;
    if (!window.__fplacesXrScene) return false;
    const routeReady =
      window.fplacesActiveRoute ||
      navigatorInstance.route?.pathCoordinates?.length;
    if (!routeReady) return false;
    if (typeof window.executeDemoCalibrationFlow !== 'function') return false;
    if (!window.FplacesSpatialAlignment?.canCalibrate(false)) return false;

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

    if (alreadyCalibrated) return true; // Missing/offscreen arrows must not re-anchor a valid world.
    const calibrated = window.executeDemoCalibrationFlow();
    DBG()?.log('Bootstrap', 'autoCalibrate executed', {
      label,
      worldAttached,
      alreadyCalibrated,
    });
    return calibrated === true;
  }

  window.__fplacesTryAutoCalibrate = tryAutoCalibrate;

  function onCameraStarted() {
    DBG()?.log('Bootstrap', 'Camera session active', { activeMode });
    SLOG()?.log?.('camera', 'Camera session started', { activeMode });
    SLOG()?.log?.('camera', 'XR camera session started - awaiting xr-onStart audit');
    window.FplacesPathArrows?.setWebGlActive?.(true);
    window.FplacesLiveViewHud?.setTrackingMode?.('slam', 'AR active');
    window.FplacesVisualTrackingMonitor?.start?.();
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
    notifyEngineReady();
    if (!window.__fplacesLiveViewRequested) {
      window.FplacesLiveViewHud?.setTrackingMode?.('slam-loading', 'AR ready');
      return;
    }
    window.FplacesLiveViewHud?.setTrackingMode?.('slam-loading', 'Starting AR…');
    tryStartXrAfterPipeline();
  }

  window.__fplacesOnXrPipelineReady = onXrPipelineReady;

  function startExperience() {
    if (started) return;
    // Preload only warms XR scripts + pipeline. Opening Live View sets
    // __fplacesLiveViewRequested so camera + HUD boot on the same document.
    if (isPreloadIdle()) return;

    const route = window.fplacesActiveRoute;
    if (!route) {
      DBG()?.error('Bootstrap', 'No route - cannot start AR');
      window.FplacesLiveViewHud?.setStatus(
        'Generate a route on the map, then open Live View.',
        true,
      );
      return;
    }
    started = true;

    DBG()?.log('Bootstrap', 'startExperience()', {
      isSecureContext: window.isSecureContext,
      href: window.location.href,
    });
    SLOG()?.log?.('start', 'Starting AR experience');
    SLOG()?.runHealthCheck?.('bootstrap-start');
    SLOG()?.scheduleAudits?.();

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
      activeMode = 'xr';
      window.__fplacesArMode = 'slam';
      // Preview getUserMedia - not XR8.run (engine was not injected).
      promptForCamera(
        window.isSecureContext
          ? 'Tap Start to open the camera.'
          : 'AR needs HTTPS. Open this app over https:// then tap Start.',
        { syncXr: false },
      );
      window.FplacesLiveViewHud?.setTrackingMode?.(
        'slam-loading',
        !window.isSecureContext ? 'Need HTTPS for AR' : 'Starting AR…',
      );
      return;
    }

    window.__fplacesExpectSlam = true;
    window.FplacesLiveViewHud?.setTrackingMode?.('slam-loading', 'Starting AR…');
    promptForCamera('Hold your phone up and tap Start to open the camera.', {
      syncXr: true,
    });

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
    const mode = resolveXrMode();
    if (window.isSecureContext && mode !== 'fallback') {
      window.__fplacesExpectSlam = true;
      armXrWait();
    }
  } else if (window.fplacesActiveRoute) {
    DBG()?.log('Bootstrap', 'Route already present at boot - starting immediately');
    startExperience();
  } else {
    DBG()?.log('Bootstrap', 'No route at boot - waiting for bridge');
    const mode = resolveXrMode();
    if (window.isSecureContext && mode !== 'fallback') {
      injectXrScripts(mode);
      window.__fplacesExpectSlam = true;
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
    window.FplacesSpatialAlignment?.checkFreshness?.();
    const nav = window.__fplacesNavigator;
    if (!nav || typeof nav.managePositionSources !== 'function') return;
    nav.managePositionSources();
  }, 1500);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pauseSlamForBackground();
      return;
    }
    recoverSlamSession('Phone unlocked - resuming AR');
  });
})();
