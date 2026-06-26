/**
 * Google Live View–style full-screen AR HUD with live guidance.
 */
(function () {
  function symbolHtml(name, sizeClass) {
    return (
      `<span class="material-symbols-rounded ${sizeClass || 'turn-symbol'}" aria-hidden="true">` +
      `${name}</span>`
    );
  }

  function formatDistance(meters) {
    if (meters == null || Number.isNaN(meters)) return { value: '', unit: '' };
    const m = Math.max(0, meters);
    if (m >= 1000) return { value: (m / 1000).toFixed(1), unit: 'km' };
    if (m >= 160) return { value: (m / 1609).toFixed(1), unit: 'mi' };
    if (m >= 100) return { value: String(Math.round(m / 10) * 10), unit: 'm' };
    if (m >= 10) return { value: String(Math.round(m)), unit: 'm' };
    if (m < 3) return { value: 'Now', unit: '' };
    return { value: m.toFixed(0), unit: 'm' };
  }

  function formatDistanceLine(meters) {
    const f = formatDistance(meters);
    if (!f.value) return '';
    if (f.unit) return `${f.value} ${f.unit}`;
    return f.value;
  }

  window.FplacesLiveViewHud = {
    update(state, navigator) {
      const liveNav = document.getElementById('live-nav');
      const statusEl = document.getElementById('status');
      const tripFooter = document.getElementById('trip-footer');
      const offPathEl = document.getElementById('offPath');
      const alignBanner = document.getElementById('align-banner');
      const alignText = document.getElementById('align-text');
      const heroDistance = document.getElementById('hero-distance');
      const heroValue = document.getElementById('hero-distance-value');
      const heroUnit = document.getElementById('hero-distance-unit');
      const arrivalCard = document.getElementById('arrival-card');
      const arrivalDest = document.getElementById('arrival-dest');
      if (!liveNav) return;

      const route = navigator?.route;
      if (!state || !route) {
        liveNav.classList.add('hidden');
        tripFooter?.classList.add('hidden');
        heroDistance?.classList.add('hidden');
        arrivalCard?.classList.add('hidden');
        return;
      }

      const deviceHeading =
        window.FplacesOrientationCompass?.getDeviceHeading?.() ??
        state.deviceHeadingDegrees ??
        null;
      const guidance = navigator?.getLiveGuidance?.(deviceHeading) || {};
      const primary = guidance.primary || { label: 'Follow route', symbol: 'straight' };
      const aligned =
        guidance.alignmentDelta == null || Math.abs(guidance.alignmentDelta) < 18;

      const liveDist =
        navigator?.getDisplayDistanceMeters?.() ??
        state.distanceToTargetMeters ??
        guidance.distanceMeters;

      const destName = state.destinationName || route.destinationName || 'destination';

      if (state.arrived) {
        liveNav.classList.add('hidden');
        tripFooter?.classList.add('hidden');
        heroDistance?.classList.add('hidden');
        alignBanner?.classList.add('hidden');
        statusEl?.classList.add('hidden');
        arrivalCard?.classList.remove('hidden');
        if (arrivalDest) arrivalDest.textContent = destName;
        if (offPathEl) offPathEl.classList.add('hidden');
        return;
      }

      arrivalCard?.classList.add('hidden');
      liveNav.classList.remove('hidden');
      tripFooter?.classList.remove('hidden');
      statusEl?.classList.add('hidden');

      const turnIconEl = document.getElementById('turn-icon');
      const turnTextEl = document.getElementById('turn-text');
      if (turnIconEl) turnIconEl.innerHTML = symbolHtml(primary.symbol, 'turn-symbol-lg');
      if (turnTextEl) {
        turnTextEl.textContent = !aligned ? primary.label : primary.label;
      }

      const thenChip = document.getElementById('then-chip');
      const thenIconEl = document.getElementById('then-icon');
      const thenTextEl = document.getElementById('then-text');
      if (guidance.then && aligned) {
        thenChip?.classList.remove('hidden');
        if (thenIconEl) thenIconEl.innerHTML = symbolHtml(guidance.then.symbol, 'turn-symbol-sm');
        if (thenTextEl) thenTextEl.textContent = guidance.then.label;
      } else {
        thenChip?.classList.add('hidden');
        if (thenTextEl) thenTextEl.textContent = '';
      }

      const distBar = document.getElementById('distance-bar');
      if (distBar) {
        if (guidance.distanceLabel) {
          distBar.textContent = guidance.distanceLabel;
        } else if (liveDist != null) {
          distBar.textContent = formatDistanceLine(liveDist);
        } else {
          distBar.textContent = aligned ? 'Follow the blue arrows' : '';
        }
      }

      if (heroDistance && heroValue && heroUnit) {
        if (aligned && liveDist != null && liveDist >= 3) {
          const hero = formatDistance(liveDist);
          heroValue.textContent = hero.value;
          heroUnit.textContent = hero.unit;
          heroUnit.style.display = hero.unit ? 'inline' : 'none';
          heroDistance.classList.remove('hidden');
        } else {
          heroDistance.classList.add('hidden');
        }
      }

      if (alignBanner && alignText) {
        if (!aligned && deviceHeading != null) {
          const delta = guidance.alignmentDelta ?? 0;
          if (Math.abs(delta) >= 135) {
            alignText.textContent = 'Turn around to face the route';
          } else if (delta > 0) {
            alignText.textContent = 'Turn right to align with the path';
          } else {
            alignText.textContent = 'Turn left to align with the path';
          }
          alignBanner.classList.remove('hidden');
        } else {
          alignBanner.classList.add('hidden');
        }
      }

      const tripDistEl = document.getElementById('trip-dist');
      if (tripDistEl) {
        const remaining =
          state.hasPosition && liveDist != null
            ? liveDist
            : state.distanceRemainingMeters ?? route.distanceMeters;
        tripDistEl.textContent = formatDistanceLine(remaining) || '—';
      }

      const destEl = document.getElementById('trip-dest');
      if (destEl) destEl.textContent = destName;

      if (offPathEl) {
        if (state.offPathMessage) {
          offPathEl.textContent = state.offPathMessage;
          offPathEl.classList.remove('hidden');
        } else {
          offPathEl.textContent = '';
          offPathEl.classList.add('hidden');
        }
      }

      const floorBanner = document.getElementById('floor-banner');
      const floorBannerText = document.getElementById('floor-banner-text');
      if (floorBanner && floorBannerText) {
        if (state.floorChangeMessage) {
          floorBannerText.textContent = state.floorChangeMessage;
          floorBanner.classList.remove('hidden');
        } else if (state.venuePositionActive && state.floorLabel) {
          floorBannerText.textContent = state.floorLabel;
          floorBanner.classList.remove('hidden');
          floorBanner.classList.add('floor-banner--subtle');
        } else {
          floorBanner.classList.add('hidden');
          floorBanner.classList.remove('floor-banner--subtle');
        }
      }
    },

    setStatus(message, isError) {
      const statusEl = document.getElementById('status');
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.remove('hidden');
      statusEl.classList.toggle('status-error', !!isError);
      if (isError) {
        document.getElementById('live-nav')?.classList.add('hidden');
        document.getElementById('hero-distance')?.classList.add('hidden');
        document.getElementById('arrival-card')?.classList.add('hidden');
      }
    },
  };
})();
