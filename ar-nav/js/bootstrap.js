/**
 * Bootstraps 8th Wall XR or fallback mode after route is available.
 */
(function () {
  const cfg = window.FPLACES_AR_CONFIG || {};
  const DBG = () => window.FplacesArDebug;
  const navigatorInstance = new window.FplacesRouteNavigator();
  window.__fplacesNavigator = navigatorInstance;

  let started = false;
  let activeMode = null;
  let xrWaitTimer = null;
  let xrPollCount = 0;

  function resolveXrMode() {
    const mode = cfg.xrMode || 'auto';
    if (mode === 'fallback') return 'fallback';
    if (mode === 'platform') {
      const hasKey = !!(cfg.eighthWallAppKey || '').trim();
      return hasKey ? 'platform' : 'binary';
    }
    if (mode === 'auto' && !window.isSecureContext) return 'fallback';
    return 'binary';
  }

  function injectXrScripts(mode) {
    const bootstrap = document.getElementById('xr-bootstrap');
    if (!bootstrap || bootstrap.dataset.loaded) return;
    bootstrap.dataset.loaded = 'true';

    if (mode === 'fallback') {
      DBG()?.log('Bootstrap', 'Skipping XR script injection (fallback mode)');
      return;
    }

    DBG()?.log('Bootstrap', 'Injecting XR scripts', { mode });

    const three = document.createElement('script');
    three.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
    three.onload = () => DBG()?.log('Bootstrap', 'THREE.js loaded');
    three.onerror = () => DBG()?.error('Bootstrap', 'THREE.js failed to load');
    document.head.appendChild(three);

    const extras = document.createElement('script');
    extras.src = 'https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js';
    extras.crossOrigin = 'anonymous';
    extras.onload = () => DBG()?.log('Bootstrap', 'XRExtras loaded');
    extras.onerror = () => DBG()?.error('Bootstrap', 'XRExtras failed to load');
    document.head.appendChild(extras);

    const xr = document.createElement('script');
    xr.async = true;
    if (mode === 'platform') {
      xr.src = `https://apps.8thwall.com/xrweb?appKey=${encodeURIComponent(cfg.eighthWallAppKey)}`;
    } else {
      xr.src = 'https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr.js';
      xr.crossOrigin = 'anonymous';
      xr.dataset.preloadChunks = 'slam';
    }
    xr.onload = () => DBG()?.log('Bootstrap', 'XR8 script tag onload', { src: xr.src });
    xr.onerror = () => DBG()?.error('Bootstrap', 'XR8 script failed to load', { src: xr.src });
    document.head.appendChild(xr);
  }

  function startFallback(reason) {
    if (activeMode === 'fallback') return;
    window.__fplacesFallbackTriggered = true;
    if (activeMode === 'xr') {
      DBG()?.warn('Bootstrap', 'XR already running — attempting fallback after error', {
        reason,
      });
      try {
        window.XR8?.stop?.();
      } catch (_) {}
    }
    if (activeMode != null && activeMode !== 'xr') return;
    activeMode = 'fallback';
    DBG()?.warn('Bootstrap', 'Starting FALLBACK mode', { reason });
    if (xrWaitTimer) {
      clearTimeout(xrWaitTimer);
      xrWaitTimer = null;
    }
    try {
      window.XR8?.stop?.();
    } catch (_) {}
    document.getElementById('camerafeed')?.remove();
    window.FplacesArCalibrationUi?.inject?.();
    window.FplacesLiveViewHud?.setStatus(
      reason || 'Camera guidance active (use HTTPS for full SLAM).',
    );
    document.getElementById('camera').style.display = 'block';
    window.FplacesFallbackNav.start({ navigator: navigatorInstance });
  }

  window.__fplacesStartFallback = startFallback;

  function startExperience() {
    if (started) return;
    started = true;

    DBG()?.log('Bootstrap', 'startExperience()');

    const route = window.fplacesActiveRoute;
    if (!route) {
      DBG()?.error('Bootstrap', 'No route — cannot start AR');
      window.FplacesLiveViewHud?.setStatus(
        'No route loaded. Generate a route in the map app, then tap AR Guidance.',
        true,
      );
      return;
    }

      navigatorInstance.setRoute(route);
      window.FplacesRouteBridge?.flushPendingPositions?.();
      window.FplacesOrientationCompass?.start?.();
    window.FplacesOrientationCompass?.attachNavigator?.(navigatorInstance);

    const mode = resolveXrMode();
    DBG()?.log('Bootstrap', 'Resolved XR mode', {
      mode,
      xrLoadTimeoutMs: cfg.xrLoadTimeoutMs ?? 12000,
      useGpsProgress: cfg.useGpsProgress,
    });
    injectXrScripts(mode);

    if (mode === 'fallback') {
      startFallback('xrMode=fallback');
      return;
    }

    window.FplacesLiveViewHud?.setStatus('Starting camera AR…');

    document.getElementById('camera').style.display = 'none';

    const xrTimeoutMs = cfg.xrLoadTimeoutMs ?? 12000;
    xrWaitTimer = setTimeout(() => {
      if (!window.XR8 || !window.THREE) {
        DBG()?.warn('Bootstrap', 'XR8/THREE load timeout', {
          hasXR8: !!window.XR8,
          hasTHREE: !!window.THREE,
          polls: xrPollCount,
          timeoutMs: xrTimeoutMs,
        });
        startFallback('AR engine slow to load. Compass arrow active.');
      }
    }, xrTimeoutMs);

    const waitForXr = () => {
      if (activeMode === 'fallback') return;
      xrPollCount += 1;
      if (!window.THREE || !window.XR8) {
        if (xrPollCount % 20 === 0) {
          DBG()?.log('Bootstrap', 'Waiting for XR8 + THREE…', {
            polls: xrPollCount,
            hasTHREE: !!window.THREE,
            hasXR8: !!window.XR8,
          });
        }
        setTimeout(waitForXr, 100);
        return;
      }
      if (activeMode != null) return;
      activeMode = 'xr';
      DBG()?.log('Bootstrap', 'XR8 + THREE ready — starting XR scene', {
        polls: xrPollCount,
        elapsedMs: xrPollCount * 100,
      });
      if (xrWaitTimer) {
        clearTimeout(xrWaitTimer);
        xrWaitTimer = null;
      }

      const hud = {
        update(state) {
          window.FplacesLiveViewHud?.update(state, navigatorInstance);
        },
      };
      window.FplacesXrNavScene.start({ navigator: navigatorInstance, hud });
    };
    waitForXr();
  }

  window.FplacesRouteBridge.onRoute((route) => {
    DBG()?.log('Bootstrap', 'onRoute callback', {
      hasRoute: !!route,
      started,
    });
    if (route) {
      navigatorInstance.setRoute(route);
      window.FplacesRouteBridge?.flushPendingPositions?.();
      if (!started) startExperience();
    }
  });

  if (cfg.demoSimWalk) {
    window.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp') window.FplacesDemoSim?.nudge?.(2);
      if (event.key === 'ArrowDown') window.FplacesDemoSim?.nudge?.(-2);
    });
  }

  if (window.fplacesActiveRoute) {
    DBG()?.log('Bootstrap', 'Route already present at boot — starting immediately');
    startExperience();
  } else {
    DBG()?.log('Bootstrap', 'No route at boot — waiting for bridge');
    window.setTimeout(() => {
      if (!window.fplacesActiveRoute && !started) {
        window.FplacesLiveViewHud?.setStatus(
          'Route not received. Close AR, regenerate the route, and tap AR Guidance again.',
          true,
        );
      }
    }, 2500);
  }

  window.setInterval(() => {
    const nav = window.__fplacesNavigator;
    if (!nav || typeof nav.managePositionSources !== 'function') return;
    nav.managePositionSources();
  }, 1500);
})();
