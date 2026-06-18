/**
 * Google Live View–style path chevrons (CSS fallback when WebGL lane is off).
 */
(function () {
  const CHEVRON_COUNT = 6;
  let laneEl = null;
  let headingBound = false;
  let webglActive = false;
  let lastAppliedDelta = null;

  const laneHeading = () => window.FplacesRouteLaneHeading;

  const CHEVRON_SVG =
    '<svg viewBox="0 0 160 80" width="100%" height="100%" aria-hidden="true">' +
    '<path d="M6 72 L80 6 L154 72" fill="none" stroke="#ffffff" stroke-width="18" ' +
    'stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M30 72 L80 32 L130 72" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="10" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function ensure() {
    if (laneEl) return laneEl;

    const root = document.createElement('div');
    root.id = 'fplaces-path-arrows';
    root.setAttribute('aria-hidden', 'true');

    const lane = document.createElement('div');
    lane.className = 'path-arrows-lane';

    for (let i = 0; i < CHEVRON_COUNT; i++) {
      const chevron = document.createElement('div');
      chevron.className = 'path-chevron';
      chevron.style.setProperty('--i', String(i));
      chevron.innerHTML = CHEVRON_SVG;
      lane.appendChild(chevron);
    }

    root.appendChild(lane);
    document.body.appendChild(root);
    laneEl = root;
    return root;
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
      laneHeading()?.ingestCompassSample?.(raw, event);
    };
    window.addEventListener('deviceorientationabsolute', onOrientation, true);
    window.addEventListener('deviceorientation', onOrientation, true);
  }

  function resolveDeviceHeading(state) {
    return laneHeading()?.resolveDeviceHeading?.(state) ?? null;
  }

  function updateLane(targetBearing, state) {
    if (webglActive) {
      if (laneEl) laneEl.style.display = 'none';
      return;
    }

    if (!laneHeading()?.shouldUpdateLane?.()) {
      return;
    }

    const root = ensure();
    const lane = root.querySelector('.path-arrows-lane');
    if (!lane) return;

    if (targetBearing == null) {
      root.style.display = 'none';
      lastAppliedDelta = null;
      return;
    }

    const deviceHeading = resolveDeviceHeading(state);
    const delta = laneHeading()?.computeLaneDeltaDeg?.(targetBearing, deviceHeading);
    if (delta == null) {
      root.style.display = 'none';
      return;
    }

    root.style.display = 'block';
    if (lastAppliedDelta == null || Math.abs(delta - lastAppliedDelta) > 0.4) {
      lane.style.setProperty('--lane-heading', `${delta.toFixed(1)}deg`);
      lastAppliedDelta = delta;
    }

    window.FplacesArDebug?.logNavStateThrottled(
      'PathArrows',
      'CSS lane updated',
      {
        targetBearingDegrees: targetBearing,
        deviceHeadingDegrees: deviceHeading,
        laneRotationDeg: delta,
        distToNextTurnM: state?.distanceToNextManeuverMeters,
      },
      1200,
    );
  }

  function updateFromStateFields(state, getTarget) {
    if (state?.arrived) {
      if (laneEl) laneEl.style.display = 'none';
      return;
    }
    updateLane(getTarget(), state);
  }

  window.FplacesPathArrows = {
    start() {
      ensure();
      laneHeading()?.reset?.();
      window.FplacesArDebug?.log('PathArrows', 'Starting path chevrons (CSS fallback ready)');
      requestHeadingPermission().then((granted) => {
        if (granted) bindHeading();
      });
      bindHeading();
    },

    setWebGlActive(active) {
      webglActive = !!active;
      if (webglActive && laneEl) laneEl.style.display = 'none';
    },

    getDeviceHeading() {
      return laneHeading()?.getSmoothedHeading?.() ?? null;
    },

    normalizeDeltaDegrees(delta) {
      return laneHeading()?.normalizeDeltaDegrees?.(delta) ?? delta;
    },

    resolveDeviceHeading(state) {
      return resolveDeviceHeading(state);
    },

    computeLaneDelta(targetBearing, state) {
      const deviceHeading = resolveDeviceHeading(state);
      return laneHeading()?.computeLaneDeltaDeg?.(targetBearing, deviceHeading);
    },

    updateFromNavigator(navigator) {
      const state = navigator?.getState?.() || {};
      updateFromStateFields(state, () => navigator?.getTargetBearingDegrees?.());
    },

    updateFromState(state) {
      updateFromStateFields(state, () =>
        state?.targetBearingDegrees ?? state?.navigationBearing ?? null,
      );
    },
  };

  window.FplacesCompassArrow = window.FplacesPathArrows;
})();
