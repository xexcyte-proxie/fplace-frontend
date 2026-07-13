/**
 * AR navigation HUD — matches design spec (instruction card + bottom sheet).
 */
(function () {
  const WALK_MPS = 1.3;

  function symbolHtml(name, sizeClass) {
    return (
      `<span class="material-symbols-rounded ${sizeClass || 'lv-sym-sm'}" aria-hidden="true">` +
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

  function formatDistanceCompact(meters) {
    if (meters == null || !Number.isFinite(meters)) return '—';
    const m = Math.max(0, meters);
    if (m >= 1000) return `${(m / 1000).toFixed(1)}km`;
    return `${Math.round(m)}m`;
  }

  function formatEta(meters) {
    if (meters == null || !Number.isFinite(meters)) return '—';
    const seconds = Math.max(0, meters / WALK_MPS);
    if (seconds < 60) return '< 1 min';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem ? `${hours} hr ${rem} min` : `${hours} hr`;
  }

  function formatArriveTime(meters) {
    if (meters == null || !Number.isFinite(meters)) return '—';
    const seconds = Math.max(0, meters / WALK_MPS);
    const arrive = new Date(Date.now() + seconds * 1000);
    const hours = arrive.getHours();
    const mins = arrive.getMinutes().toString().padStart(2, '0');
    const h12 = hours % 12 || 12;
    return `${h12}:${mins}`;
  }

  function titleCase(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function buildDestinationMeta(state, route, destName) {
    const parts = [];
    const name = destName || '';

    const gateMatch = name.match(/\bgate\s+[a-z0-9]+\b/i);
    if (gateMatch) parts.push(titleCase(gateMatch[0]));

    const sectionMatch = name.match(/\bsection\s+\d+\b/i);
    if (sectionMatch && !gateMatch) parts.push(titleCase(sectionMatch[0]));

    const floorId = route?.destination?.floorId;
    const floors = route?.floors || [];
    const destFloor = floors.find((f) => f.id === floorId);
    const level =
      route?.destinationFloorName ||
      destFloor?.name ||
      state?.floorLabel ||
      '';
    if (level) {
      const normalized = /^level\s/i.test(level) ? level : `Level ${level.replace(/^l/i, '')}`;
      parts.push(titleCase(normalized));
    }

    const aisleMatch = name.match(/\baisle\s+\d+\b/i);
    if (aisleMatch) {
      parts.push(titleCase(aisleMatch[0]));
    } else if (route?.destinationAreaHint) {
      parts.push(route.destinationAreaHint);
    }

    return parts.length ? parts.join(' · ') : '—';
  }

  function instructionLabel(primary) {
    const label = primary?.label || 'Follow route';
    if (primary?.symbol === 'straight' || /straight/i.test(label)) {
      return 'Continue straight';
    }
    return label;
  }

  function distancePhrase(meters) {
    const line = formatDistanceLine(meters);
    if (!line || line === 'Now') return line;
    return `for ${line}`;
  }

  function setNavigating(active) {
    document.body.classList.toggle('lv-active', active);
  }

  function setScanOverlay(visible, message) {
    const overlay = document.getElementById('scan-overlay');
    const copy = document.getElementById('scan-copy');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !visible);
    if (copy && message) copy.textContent = message;
    setNavigating(!visible);
  }

  function setTrackingMode(mode, detail) {
    const badge = document.getElementById('tracking-mode-badge');
    const label = document.getElementById('tracking-mode-label');
    if (!badge || !label) return;

    if (window.FplacesCameraStart?.isAwaiting?.()) {
      label.textContent = 'Tap Start for camera';
      badge.className = 'lv-mode-badge lv-mode-badge--loading';
      badge.classList.remove('hidden');
      return;
    }

    window.__fplacesArMode = mode;

    if (mode === 'slam-loading') {
      label.textContent = detail || 'Starting AR…';
      badge.className = 'lv-mode-badge lv-mode-badge--loading';
      badge.classList.remove('hidden');
      return;
    }

    label.textContent = 'AR mode active';
    badge.className = 'lv-mode-badge';
    badge.classList.remove('hidden');
  }

  window.FplacesLiveViewHud = {
    setTrackingMode,

    update(state, navigator) {
      const liveNav = document.getElementById('live-nav');
      const statusEl = document.getElementById('status');
      const tripFooter = document.getElementById('trip-footer');
      const offPathEl = document.getElementById('offPath');
      const alignBanner = document.getElementById('align-banner');
      const alignText = document.getElementById('align-text');
      const arrivalCard = document.getElementById('arrival-card');
      const arrivalDest = document.getElementById('arrival-dest');
      if (!liveNav) return;

      const route = navigator?.route;
      if (!state || !route) {
        liveNav.classList.add('hidden');
        tripFooter?.classList.add('hidden');
        arrivalCard?.classList.add('hidden');
        setNavigating(false);
        return;
      }

      if (
        window.FplacesCameraStart?.isAwaiting?.() ||
        !window.FplacesCameraStart?.isStarted?.()
      ) {
        liveNav.classList.add('hidden');
        tripFooter?.classList.add('hidden');
        arrivalCard?.classList.add('hidden');
        alignBanner?.classList.add('hidden');
        setNavigating(false);
        return;
      }

      setScanOverlay(false);

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

      const destName = state.destinationName || route.destinationName || 'Destination';
      const remainingTotal =
        state.distanceRemainingMeters ??
        navigator?.distanceRemainingToDestinationMeters?.() ??
        route.distanceMeters;

      if (state.arrived) {
        liveNav.classList.add('hidden');
        tripFooter?.classList.add('hidden');
        alignBanner?.classList.add('hidden');
        statusEl?.classList.add('hidden');
        arrivalCard?.classList.remove('hidden');
        if (arrivalDest) arrivalDest.textContent = destName;
        if (offPathEl) offPathEl.classList.add('hidden');
        setNavigating(false);
        return;
      }

      setNavigating(true);
      arrivalCard?.classList.add('hidden');
      liveNav.classList.remove('hidden');
      tripFooter?.classList.remove('hidden');
      statusEl?.classList.add('hidden');

      const turnIconEl = document.getElementById('turn-icon');
      const turnTextEl = document.getElementById('turn-text');
      const distBar = document.getElementById('distance-bar');
      const isStraight = primary.symbol === 'straight' || /straight/i.test(primary.label || '');

      if (turnIconEl) {
        const icon = isStraight ? 'arrow_upward' : primary.symbol;
        turnIconEl.innerHTML = symbolHtml(icon, 'lv-sym-lg');
      }

      if (turnTextEl && distBar) {
        if (!aligned) {
          turnTextEl.textContent = instructionLabel(primary);
          distBar.textContent = 'Point your phone at the path';
        } else if (liveDist != null && liveDist <= 8 && !isStraight) {
          turnTextEl.textContent = instructionLabel(primary);
          distBar.textContent = 'Now';
        } else {
          turnTextEl.textContent = instructionLabel(primary);
          distBar.textContent = distancePhrase(liveDist) || guidance.distanceLabel || '';
        }
      }

      const tripDistEl = document.getElementById('trip-dist');
      if (tripDistEl) {
        const remaining =
          state.hasPosition && remainingTotal != null
            ? remainingTotal
            : route.distanceMeters;
        tripDistEl.textContent =
          remaining != null ? formatDistanceCompact(remaining) : '—';
      }

      const tripEtaEl = document.getElementById('trip-eta');
      if (tripEtaEl) {
        tripEtaEl.textContent = formatEta(remainingTotal);
      }

      const tripArriveEl = document.getElementById('trip-arrive');
      if (tripArriveEl) {
        tripArriveEl.textContent = formatArriveTime(remainingTotal);
      }

      const destEl = document.getElementById('trip-dest');
      if (destEl) destEl.textContent = destName;

      const destMetaEl = document.getElementById('trip-dest-meta');
      if (destMetaEl) {
        destMetaEl.textContent = buildDestinationMeta(state, route, destName);
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

      if (alignBanner && alignText) {
        if (!aligned && deviceHeading != null) {
          const delta = guidance.alignmentDelta ?? 0;
          if (Math.abs(delta) >= 135) {
            alignText.textContent = 'Turn around';
          } else if (delta > 0) {
            alignText.textContent = 'Turn right';
          } else {
            alignText.textContent = 'Turn left';
          }
          alignBanner.classList.remove('hidden');
        } else {
          alignBanner.classList.add('hidden');
        }
      }

      const floorBanner = document.getElementById('floor-banner');
      const floorBannerText = document.getElementById('floor-banner-text');
      if (floorBanner && floorBannerText) {
        if (state.floorChangeMessage) {
          floorBannerText.textContent = state.floorChangeMessage;
          floorBanner.classList.remove('hidden');
          floorBanner.classList.remove('lv-floor--muted');
        } else if (state.venuePositionActive && state.floorLabel) {
          floorBannerText.textContent = state.floorLabel;
          floorBanner.classList.remove('hidden');
          floorBanner.classList.add('lv-floor--muted');
        } else {
          floorBanner.classList.add('hidden');
          floorBanner.classList.remove('lv-floor--muted');
        }
      }
    },

    setStatus(message, isError) {
      const statusEl = document.getElementById('status');
      if (!statusEl) return;

      statusEl.textContent = message;
      statusEl.classList.remove('hidden');
      statusEl.classList.toggle('lv-status--error', !!isError);

      if (isError) {
        setScanOverlay(false);
        document.getElementById('live-nav')?.classList.add('hidden');
        document.getElementById('arrival-card')?.classList.add('hidden');
        setNavigating(false);
        return;
      }

      if (window.__fplacesAwaitingCameraStart) {
        return;
      }

      const bootMessages = [
        'starting',
        'waiting',
        'route not',
        'move your phone',
        'finding',
        'live view',
        'tap start',
        'tap to',
        'floor tracking',
      ];
      const lower = String(message || '').toLowerCase();
      const isBoot = bootMessages.some((prefix) => lower.includes(prefix));

      if (isBoot) {
        setScanOverlay(true, message || 'Move your phone slowly');
        document.getElementById('live-nav')?.classList.add('hidden');
        document.getElementById('trip-footer')?.classList.add('hidden');
      } else {
        setScanOverlay(false);
      }
    },
  };
})();
