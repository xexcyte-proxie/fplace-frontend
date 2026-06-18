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
    if (meters == null || Number.isNaN(meters)) return '';
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    if (meters >= 160) return `${(meters / 1609).toFixed(1)} mi`;
    return `${Math.max(0, meters).toFixed(1)} m`;
  }

  window.FplacesLiveViewHud = {
    update(state, navigator) {
      const liveNav = document.getElementById('live-nav');
      const statusEl = document.getElementById('status');
      const tripFooter = document.getElementById('trip-footer');
      const offPathEl = document.getElementById('offPath');
      if (!liveNav) return;

      const route = navigator?.route;
      if (!state || !route) {
        liveNav.classList.add('hidden');
        tripFooter?.classList.add('hidden');
        return;
      }

      liveNav.classList.remove('hidden');
      tripFooter?.classList.remove('hidden');
      statusEl?.classList.add('hidden');

      const deviceHeading =
        window.FplacesOrientationCompass?.getDeviceHeading?.() ??
        state.deviceHeadingDegrees ??
        null;
      const guidance = navigator?.getLiveGuidance?.(deviceHeading) || {};
      const primary = guidance.primary || { label: 'Follow route', symbol: 'straight' };

      const liveDist =
        navigator?.getDisplayDistanceMeters?.() ??
        state.distanceToTargetMeters ??
        guidance.distanceMeters;

      const turnIconEl = document.getElementById('turn-icon');
      const turnTextEl = document.getElementById('turn-text');
      if (turnIconEl) turnIconEl.innerHTML = symbolHtml(primary.symbol, 'turn-symbol-lg');
      if (turnTextEl) turnTextEl.textContent = primary.label;

      const thenChip = document.getElementById('then-chip');
      const thenIconEl = document.getElementById('then-icon');
      const thenTextEl = document.getElementById('then-text');
      if (guidance.then && !state.arrived) {
        thenChip?.classList.remove('hidden');
        if (thenIconEl) thenIconEl.innerHTML = symbolHtml(guidance.then.symbol, 'turn-symbol-sm');
        if (thenTextEl) thenTextEl.textContent = guidance.then.label;
      } else {
        thenChip?.classList.add('hidden');
        if (thenTextEl) thenTextEl.textContent = '';
      }

      const distBar = document.getElementById('distance-bar');
      if (distBar) {
        if (state.arrived) {
          distBar.textContent = 'You have reached your destination';
        } else if (guidance.distanceLabel) {
          distBar.textContent = guidance.distanceLabel;
        } else if (liveDist != null) {
          distBar.textContent = formatDistance(liveDist);
        } else {
          distBar.textContent = '';
        }
      }

      const tripDistEl = document.getElementById('trip-dist');
      if (tripDistEl) {
        if (state.hasPosition && liveDist != null) {
          tripDistEl.textContent = formatDistance(liveDist);
        } else if (state.distanceRemainingMeters != null) {
          tripDistEl.textContent = formatDistance(state.distanceRemainingMeters);
        } else {
          tripDistEl.textContent = formatDistance(route.distanceMeters) || '—';
        }
      }

      const destEl = document.getElementById('trip-dest');
      if (destEl) {
        destEl.textContent = state.destinationName || route.destinationName || '';
      }

      if (offPathEl) {
        if (state.offPathMessage) {
          offPathEl.textContent = state.offPathMessage;
          offPathEl.classList.remove('hidden');
        } else {
          offPathEl.textContent = '';
          offPathEl.classList.add('hidden');
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
      }
    },
  };
})();
