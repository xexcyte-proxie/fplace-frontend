/**
 * Dev/demo walk simulator - advances route progress when device motion detects steps.
 * Enable with ?demoSim=1 when indoor GPS is too weak for a live demo.
 */
(function () {
  const TICK_MS = 100;
  const STEP_METERS_PER_TICK = 0.13;
  const PARENT_FEED_SOURCES = new Set(['simulator', 'pwa', 'mappedin', 'flutter']);

  let enabled = false;
  let lastStepAt = 0;
  let bound = false;
  let autoWalkTimer = null;

  function isEnabled() {
    const cfg = window.FPLACES_AR_CONFIG || {};
    const nav = window.__fplacesNavigator;
    if (nav?.positionSource === 'simulator' || nav?.lastPosition?.source === 'simulator') {
      return false;
    }
    return cfg.demoSimWalk === true;
  }

  function onMotion(event) {
    if (!enabled) return;
    const nav = window.__fplacesNavigator;
    if (!nav?.route || nav.arrived) return;

    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    const now = performance.now();
    if (mag > 11.2 && now - lastStepAt > 380) {
      lastStepAt = now;
      advanceSimulated(nav, 0.72);
    }
  }

  function advanceSimulated(navigator, meters) {
    const path = navigator.route?.pathCoordinates || [];
    if (!path.length) return;

    const geo = window.FplacesRouteGeometry;
    const current =
      navigator.getDisplaySnap?.() ||
      geo.snapAtDistanceAlongPath(path, navigator._displayAlongPathM ?? 0);
    if (!current) return;

    const along = (current.distanceAlongPathMeters ?? 0) + meters;
    const next = geo.snapAtDistanceAlongPath(path, along);
    if (!next) return;

    navigator.applyPosition({
      latitude: next.latitude,
      longitude: next.longitude,
      accuracy: 4,
      floorId: current.floorId || path[0]?.floorId,
      source: 'simWalk',
    });
  }

  function parentIsFeedingMovement() {
    const last = window.__fplacesLastPositionFrame;
    if (!last || !PARENT_FEED_SOURCES.has(last.source)) return false;

    const lat = last.latitude;
    const lng = last.longitude;
    if (lat == null || lng == null) return false;

    // Parent sends 10Hz frames even when paused (same lat/lng). Only defer to
    // parent when coordinates are actually changing between ticks.
    if (parentIsFeedingMovement.lastLat !== lat || parentIsFeedingMovement.lastLng !== lng) {
      parentIsFeedingMovement.lastLat = lat;
      parentIsFeedingMovement.lastLng = lng;
      return true;
    }

    return false;
  }
  parentIsFeedingMovement.lastLat = null;
  parentIsFeedingMovement.lastLng = null;

  function stopAutoWalk() {
    if (autoWalkTimer == null) return;
    window.clearInterval(autoWalkTimer);
    autoWalkTimer = null;
  }

  window.FplacesDemoSim = {
    start() {
      enabled = isEnabled();
      if (!enabled || bound) return;
      if (window.DeviceMotionEvent?.requestPermission) {
        window.DeviceMotionEvent.requestPermission()
          .then((state) => {
            if (state === 'granted') {
              window.addEventListener('devicemotion', onMotion, true);
              bound = true;
            }
          })
          .catch(() => undefined);
      } else {
        window.addEventListener('devicemotion', onMotion, true);
        bound = true;
      }
      window.FplacesArDebug?.log('DemoSim', 'Walk simulator active - shake/steps advance route');
    },

    stop() {
      enabled = false;
      stopAutoWalk();
      if (bound) {
        window.removeEventListener('devicemotion', onMotion, true);
        bound = false;
      }
    },

    /** Interval walk along the route when the parent map is not streaming movement. */
    startAutoWalk() {
      if (window.parent && window.parent !== window) {
        window.FplacesArDebug?.log(
          'DemoSim',
          'Auto-walk skipped - embedded in PWA; parent simulator drives movement',
        );
        return;
      }
      stopAutoWalk();
      window.FplacesArDebug?.log('DemoSim', 'Auto-walk started (calibrate)');
      autoWalkTimer = window.setInterval(() => {
        const nav = window.__fplacesNavigator;
        if (!nav?.route || nav.arrived) {
          stopAutoWalk();
          return;
        }
        if (parentIsFeedingMovement()) return;
        advanceSimulated(nav, STEP_METERS_PER_TICK);
      }, TICK_MS);
    },

    /** Manual nudge for desktop dev tools. */
    nudge(meters = 2) {
      const nav = window.__fplacesNavigator;
      if (nav) advanceSimulated(nav, meters);
    },
  };
})();
