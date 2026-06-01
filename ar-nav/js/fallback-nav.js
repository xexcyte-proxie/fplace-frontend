/**
 * Fallback navigation UI when XR8 is unavailable (HTTP / desktop / no SLAM).
 * Includes a 2D compass arrow overlay synced to the same route bearing logic.
 */
(function () {
  function ensureCompassArrow() {
    let el = document.getElementById('fplaces-compass-arrow');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'fplaces-compass-arrow';
    el.innerHTML =
      '<svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true">' +
      '<path d="M32 6 L52 54 L32 44 L12 54 Z" fill="#22c55e" stroke="#14532d" stroke-width="2"/></svg>';
    el.style.cssText =
      'position:fixed;left:50%;top:42%;transform:translate(-50%,-50%) rotate(0deg);' +
      'z-index:3;pointer-events:none;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.45));' +
      'transition:transform 0.15s linear;';
    document.body.appendChild(el);
    return el;
  }

  function normalizeDeltaDegrees(delta) {
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  function readCompassHeading(event) {
    if (typeof event.webkitCompassHeading === 'number') {
      return event.webkitCompassHeading;
    }
    if (typeof event.alpha !== 'number') return null;
    return (360 - event.alpha) % 360;
  }

  window.FplacesFallbackNav = {
    start({ navigator }) {
      const statusEl = document.getElementById('status');
      const instructionEl = document.getElementById('instruction');
      const metaEl = document.getElementById('meta');
      const offPathEl = document.getElementById('offPath');
      const video = document.getElementById('camera');
      const compassArrow = ensureCompassArrow();
      let deviceHeadingDeg = null;

      const onOrientation = (event) => {
        const heading = readCompassHeading(event);
        if (heading != null) deviceHeadingDeg = heading;
      };
      window.addEventListener('deviceorientationabsolute', onOrientation, true);
      window.addEventListener('deviceorientation', onOrientation, true);

      const hud = {
        update(state) {
          if (!state) return;
          instructionEl.textContent = state.instruction;
          metaEl.textContent = [
            state.destinationName,
            state.distanceMeters != null
              ? `${Math.round(state.distanceMeters)} m total`
              : '',
            `Step ${state.maneuverIndex + 1} / ${state.maneuverCount || 1}`,
            state.pathPointCount ? `${state.pathPointCount} path points` : '',
          ]
            .filter(Boolean)
            .join(' · ');
          offPathEl.textContent = state.offPathMessage || '';
          if (state.arrived) {
            statusEl.textContent = 'Arrived';
          }

          const target = state.targetBearingDegrees ?? state.navigationBearing;
          if (target != null && deviceHeadingDeg != null) {
            const delta = normalizeDeltaDegrees(target - deviceHeadingDeg);
            compassArrow.style.transform =
              `translate(-50%,-50%) rotate(${delta}deg)`;
            compassArrow.style.display = 'block';
          } else if (target != null) {
            compassArrow.style.transform = 'translate(-50%,-50%) rotate(0deg)';
            compassArrow.style.display = 'block';
          } else {
            compassArrow.style.display = 'none';
          }
        },
      };

      navigator.onUpdate = (s) => hud.update(s);

      if (navigator.route) {
        statusEl.textContent = `Route loaded — ${navigator.route.pathCoordinates?.length || 0} points`;
      }

      if (video && window.navigator.mediaDevices?.getUserMedia) {
        window.navigator.mediaDevices
          .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
          .then((stream) => {
            video.srcObject = stream;
          })
          .catch(() => {
            statusEl.textContent += ' (camera blocked — directions still shown)';
          });
      }

      const cfg = window.FPLACES_AR_CONFIG || {};
      if (cfg.useGpsProgress !== false) {
        navigator.startGps();
      }
      navigator.notify();

      window.FplacesRouteBridge.sendToFlutter({ event: 'trackingGood' });

      return hud;
    },
  };
})();
