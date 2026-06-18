/**
 * Dual ground chevrons: white = forward (device), red = route offset (Google-style).
 */
(function () {
  const CHEVRON_COUNT = 6;
  let rootEl = null;
  let userLaneEl = null;
  let targetLaneEl = null;
  let headingBound = false;
  let rafId = null;
  let lastNavigator = null;
  let smoothedDelta = null;

  const laneHeading = () => window.FplacesRouteLaneHeading;

  const CHEVRON_SVG_WHITE =
    '<svg viewBox="0 0 160 80" width="100%" height="100%" aria-hidden="true">' +
    '<path d="M6 72 L80 6 L154 72" fill="none" stroke="#ffffff" stroke-width="18" ' +
    'stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M30 72 L80 32 L130 72" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="10" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const CHEVRON_SVG_RED =
    '<svg viewBox="0 0 160 80" width="100%" height="100%" aria-hidden="true">' +
    '<path d="M6 72 L80 6 L154 72" fill="none" stroke="#ea4335" stroke-width="18" ' +
    'stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M30 72 L80 32 L130 72" fill="none" stroke="rgba(234,67,53,0.45)" stroke-width="10" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function buildLane(className, svg) {
    const lane = document.createElement('div');
    lane.className = `path-arrows-lane ${className}`;

    for (let i = 0; i < CHEVRON_COUNT; i++) {
      const chevron = document.createElement('div');
      chevron.className = 'path-chevron';
      chevron.style.setProperty('--i', String(i));
      chevron.innerHTML = svg;
      lane.appendChild(chevron);
    }

    return lane;
  }

  function ensure() {
    if (rootEl) return rootEl;

    rootEl = document.createElement('div');
    rootEl.id = 'fplaces-orientation-compass';
    rootEl.setAttribute('aria-hidden', 'true');

    const ground = document.createElement('div');
    ground.className = 'compass-ground';

    targetLaneEl = buildLane('lane-target', CHEVRON_SVG_RED);
    userLaneEl = buildLane('lane-user', CHEVRON_SVG_WHITE);

    ground.appendChild(targetLaneEl);
    ground.appendChild(userLaneEl);
    rootEl.appendChild(ground);
    document.body.appendChild(rootEl);
    return rootEl;
  }

  function readDeviceHeading(event) {
    if (
      typeof event.webkitCompassHeading === 'number' &&
      !Number.isNaN(event.webkitCompassHeading)
    ) {
      return event.webkitCompassHeading;
    }
    if (typeof event.alpha !== 'number' || Number.isNaN(event.alpha)) return null;
    return (360 - event.alpha) % 360;
  }

  function requestHeadingPermission() {
    if (
      typeof DeviceOrientationEvent === 'undefined' ||
      typeof DeviceOrientationEvent.requestPermission !== 'function'
    ) {
      return Promise.resolve(true);
    }
    return DeviceOrientationEvent.requestPermission()
      .then((state) => state === 'granted')
      .catch(() => false);
  }

  function bindHeading() {
    if (headingBound) return;
    headingBound = true;
    const onOrientation = (event) => {
      const raw = readDeviceHeading(event);
      laneHeading()?.setInstantHeading?.(raw);
    };
    window.addEventListener('deviceorientationabsolute', onOrientation, true);
    window.addEventListener('deviceorientation', onOrientation, true);
  }

  function normalizeDelta(delta) {
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  /** White lane = forward (0°). Red lane = route offset relative to device heading. */
  function applyRelativeRotation(deltaDeg) {
    if (userLaneEl) {
      userLaneEl.style.setProperty('--lane-heading', '0deg');
    }
    if (targetLaneEl && deltaDeg != null) {
      targetLaneEl.style.setProperty('--lane-heading', `${deltaDeg.toFixed(1)}deg`);
    }
  }

  function tick() {
    rafId = requestAnimationFrame(tick);
    if (!lastNavigator) return;

    if (lastNavigator.lastPosition) {
      lastNavigator.ensureSnap?.();
    }

    const state = lastNavigator.getState?.() || {};
    if (state.arrived) {
      if (rootEl) rootEl.style.display = 'none';
      return;
    }

    const targetRaw = lastNavigator.getTargetBearingDegrees?.();
    if (targetRaw == null) {
      if (rootEl) rootEl.style.display = 'none';
      return;
    }

    ensure();
    rootEl.style.display = 'block';

    laneHeading()?.resolveDeviceHeading?.(state);
    const userDeg = laneHeading()?.getInstantHeading?.();
    const targetDeg = laneHeading()?.smoothTargetBearing?.(targetRaw) ?? targetRaw;

    let delta = 0;
    if (userDeg != null && targetDeg != null) {
      delta = normalizeDelta(targetDeg - userDeg);
    }

    if (smoothedDelta == null) {
      smoothedDelta = delta;
    } else {
      const change = normalizeDelta(delta - smoothedDelta);
      smoothedDelta += change * 0.42;
    }

    applyRelativeRotation(smoothedDelta);

    const headingForMinimap = userDeg ?? 0;
    window.FplacesMinimap?.update?.(lastNavigator, headingForMinimap);
    window.FplacesLiveViewHud?.update?.(state, lastNavigator);
  }

  window.FplacesOrientationCompass = {
    start() {
      ensure();
      laneHeading()?.reset?.();
      smoothedDelta = null;
      window.FplacesArDebug?.log('OrientationCompass', 'Starting relative chevron lanes');
      requestHeadingPermission().then((granted) => {
        if (granted) bindHeading();
      });
      bindHeading();
      if (!rafId) tick();
    },

    attachNavigator(navigator) {
      lastNavigator = navigator;
    },

    stop() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },

    getDeviceHeading() {
      return laneHeading()?.getInstantHeading?.() ?? null;
    },

    getAlignmentDelta(state, targetBearing) {
      if (laneHeading()?.getInstantHeading?.() == null) {
        laneHeading()?.resolveDeviceHeading?.(state);
      }
      return laneHeading()?.computeAlignmentDelta?.(
        targetBearing,
        laneHeading()?.getInstantHeading?.(),
      );
    },
  };

  window.FplacesPathArrows = {
    start() {
      window.FplacesOrientationCompass.start();
    },
    setWebGlActive() {},
    getDeviceHeading() {
      return window.FplacesOrientationCompass.getDeviceHeading();
    },
    updateFromNavigator(navigator) {
      window.FplacesOrientationCompass.attachNavigator(navigator);
    },
    updateFromState() {},
  };
  window.FplacesCompassArrow = window.FplacesPathArrows;
})();
