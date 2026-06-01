/**
 * Bootstraps 8th Wall XR or fallback mode after route is available.
 */
(function () {
  const cfg = window.FPLACES_AR_CONFIG || {};
  const navigatorInstance = new window.FplacesRouteNavigator();
  let started = false;

  function resolveXrMode() {
    const mode = cfg.xrMode || 'auto';
    if (mode === 'fallback') return 'fallback';
    if (mode === 'platform') {
      const hasKey = !!(cfg.eighthWallAppKey || '').trim();
      return hasKey ? 'platform' : 'binary';
    }
    // auto + binary: open-source engine (no App Key since 8thwall.org, Feb 2026)
    return 'binary';
  }

  function injectXrScripts(mode) {
    const bootstrap = document.getElementById('xr-bootstrap');
    if (!bootstrap || bootstrap.dataset.loaded) return;
    bootstrap.dataset.loaded = 'true';

    if (mode === 'fallback') return;

    const three = document.createElement('script');
    three.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
    document.head.appendChild(three);

    const extras = document.createElement('script');
    extras.src = 'https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js';
    extras.crossOrigin = 'anonymous';
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
    document.head.appendChild(xr);
  }

  function startExperience() {
    if (started) return;
    started = true;

    const route = window.fplacesActiveRoute;
    if (!route) {
      document.getElementById('status').textContent =
        'No route loaded. Generate a route in the map app, then tap AR Guidance.';
      return;
    }

    navigatorInstance.setRoute(route);
    const mode = resolveXrMode();
    injectXrScripts(mode);

    if (mode === 'fallback') {
      document.getElementById('status').textContent =
        'Fallback mode — use HTTPS on a phone for full 8th Wall SLAM (xrMode=auto).';
      document.getElementById('camera').style.display = 'block';
      window.FplacesFallbackNav.start({ navigator: navigatorInstance });
      return;
    }

    document.getElementById('status').textContent = 'Starting 8th Wall AR…';
    document.getElementById('camera').style.display = 'none';

    const waitForXr = () => {
      if (!window.THREE || !window.XR8) {
        setTimeout(waitForXr, 100);
        return;
      }
      const hud = {
        update(state) {
          document.getElementById('instruction').textContent = state.instruction;
          document.getElementById('meta').textContent = [
            state.destinationName,
            state.distanceMeters != null
              ? `${Math.round(state.distanceMeters)} m total`
              : '',
            `Step ${state.maneuverIndex + 1} / ${state.maneuverCount || 1}`,
          ]
            .filter(Boolean)
            .join(' · ');
          document.getElementById('offPath').textContent = state.offPathMessage || '';
          document.getElementById('status').textContent = '8th Wall AR active';
        },
      };
      window.FplacesXrNavScene.start({ navigator: navigatorInstance, hud });
    };
    waitForXr();
  }

  window.FplacesRouteBridge.onRoute((route) => {
    if (route) {
      navigatorInstance.setRoute(route);
      if (!started) startExperience();
    }
  });

  if (window.fplacesActiveRoute) {
    startExperience();
  }
})();
