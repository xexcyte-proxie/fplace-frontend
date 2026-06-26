/**
 * Ground chevrons: Google Live View style.
 * Aligned → single blue path lane. Misaligned → red offset lane + align HUD.
 * Hidden when WebGL lane is active (XR mode).
 */
(function () {
  const CHEVRON_COUNT = 7;
  const ALIGN_THRESHOLD_DEG = 18;
  let rootEl = null;
  let userLaneEl = null;
  let targetLaneEl = null;
  let pathLaneEl = null;
  let headingBound = false;
  let rafId = null;
  let lastNavigator = null;
  let smoothedDelta = null;
  let webGlActive = false;
  let lastAligned = true;

  const laneHeading = () => window.FplacesRouteLaneHeading;

  const CHEVRON_SVG_BLUE =
    '<svg viewBox="0 0 160 80" width="100%" height="100%" aria-hidden="true">' +
    '<path d="M6 72 L80 6 L154 72" fill="none" stroke="#4285f4" stroke-width="20" ' +
    'stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M28 72 L80 28 L132 72" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="11" ' +
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

    pathLaneEl = buildLane('lane-path', CHEVRON_SVG_BLUE);
    targetLaneEl = buildLane('lane-target', CHEVRON_SVG_RED);
    userLaneEl = buildLane('lane-user hidden-lane', CHEVRON_SVG_BLUE);

    ground.appendChild(pathLaneEl);
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

  function applyLaneVisuals(deltaDeg, aligned) {
    if (pathLaneEl) {
      pathLaneEl.style.setProperty('--lane-heading', '0deg');
      pathLaneEl.classList.toggle('hidden-lane', !aligned);
    }
    if (targetLaneEl) {
      targetLaneEl.classList.toggle('hidden-lane', aligned);
      if (!aligned && deltaDeg != null) {
        targetLaneEl.style.setProperty('--lane-heading', `${deltaDeg.toFixed(1)}deg`);
      }
    }
    if (userLaneEl) {
      userLaneEl.classList.add('hidden-lane');
    }
    if (rootEl) {
      rootEl.classList.toggle('compass-aligned', aligned);
      rootEl.classList.toggle('compass-misaligned', !aligned);
    }
  }

  function computeLaneDelta(targetRaw, state) {
    laneHeading()?.resolveDeviceHeading?.(state);
    const userDeg = laneHeading()?.getInstantHeading?.();
    const targetDeg = laneHeading()?.smoothTargetBearing?.(targetRaw) ?? targetRaw;
    if (userDeg == null || targetDeg == null) return null;
    return normalizeDelta(targetDeg - userDeg);
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

    if (webGlActive) {
      if (rootEl) rootEl.style.display = 'none';
      window.FplacesPathArrows3d?.update?.({ navigator: lastNavigator });
      const headingForMinimap = laneHeading()?.getInstantHeading?.() ?? 0;
      window.FplacesMinimap?.update?.(lastNavigator, headingForMinimap);
      window.FplacesLiveViewHud?.update?.(state, lastNavigator);
      return;
    }

    ensure();
    rootEl.style.display = 'block';

    const delta = computeLaneDelta(targetRaw, state) ?? 0;
    const aligned = Math.abs(delta) < ALIGN_THRESHOLD_DEG;

    if (smoothedDelta == null) {
      smoothedDelta = delta;
    } else {
      const change = normalizeDelta(delta - smoothedDelta);
      const alpha = aligned ? 0.28 : 0.42;
      smoothedDelta += change * alpha;
    }

    applyLaneVisuals(smoothedDelta, aligned);
    lastAligned = aligned;

    const headingForMinimap = laneHeading()?.getInstantHeading?.() ?? 0;
    window.FplacesMinimap?.update?.(lastNavigator, headingForMinimap);
    window.FplacesLiveViewHud?.update?.(state, lastNavigator);
  }

  window.FplacesOrientationCompass = {
    start() {
      ensure();
      laneHeading()?.reset?.();
      smoothedDelta = null;
      window.FplacesArDebug?.log('OrientationCompass', 'Starting Live View chevron lanes');
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

    isAligned() {
      return lastAligned;
    },

    getAlignmentDelta(state, targetBearing) {
      return computeLaneDelta(targetBearing ?? lastNavigator?.getTargetBearingDegrees?.(), state);
    },
  };

  window.FplacesPathArrows = {
    start() {
      window.FplacesOrientationCompass.start();
    },

    setWebGlActive(active) {
      webGlActive = !!active;
      if (webGlActive && rootEl) rootEl.style.display = 'none';
    },

    getDeviceHeading() {
      return window.FplacesOrientationCompass.getDeviceHeading();
    },

    computeLaneDelta(target, state) {
      return computeLaneDelta(target, state ?? lastNavigator?.getState?.());
    },

    shouldUpdateLane() {
      return !webGlActive || window.FplacesPathArrows3d?.isAttached?.();
    },

    updateFromNavigator(navigator) {
      window.FplacesOrientationCompass.attachNavigator(navigator);
    },

    updateFromState() {},
  };
  window.FplacesCompassArrow = window.FplacesPathArrows;
})();
