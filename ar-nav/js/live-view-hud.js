/**
 * AR navigation HUD - matches design spec (instruction card + bottom sheet).
 */
(function () {
  /** Match PWA `WALKING_SPEED_MPS` so map sheet and AR HUD agree on ETA. */
  const WALK_MPS = 1.4;

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
    if (meters == null || !Number.isFinite(meters)) return '-';
    const m = Math.max(0, meters);
    if (m >= 1000) return `${(m / 1000).toFixed(1)}km`;
    return `${Math.round(m)}m`;
  }

  function formatEta(meters) {
    if (meters == null || !Number.isFinite(meters)) return '-';
    const seconds = Math.max(0, meters / WALK_MPS);
    if (seconds < 60) return '< 1 min';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem ? `${hours} hr ${rem} min` : `${hours} hr`;
  }

  function formatArriveTime(meters) {
    if (meters == null || !Number.isFinite(meters)) return '-';
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

    return parts.length ? parts.join(' · ') : '-';
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

  let cueWasVisible = false;
  let lastCueSide = '';
  let lastCueLabel = '';
  let lastCueSymbol = '';

  function hideAlignCue(alignBanner) {
    cueWasVisible = false;
    lastCueSide = '';
    lastCueLabel = '';
    lastCueSymbol = '';
    if (!alignBanner) return;
    alignBanner.classList.add('hidden');
    alignBanner.classList.remove(
      'lv-align--left',
      'lv-align--right',
      'lv-align--around',
    );
  }

  function applyAlignCue(alignBanner, alignText, deltaDeg) {
    const resolve = window.FplacesTurnCue?.resolveTurnCue;
    const cue = resolve
      ? resolve(deltaDeg, cueWasVisible)
      : { visible: false };
    cueWasVisible = !!cue.visible;

    if (!alignBanner) return !cue.visible;
    if (!cue.visible) {
      hideAlignCue(alignBanner);
      return true;
    }

    const sideClass = `lv-align--${cue.side}`;
    if (lastCueSide !== sideClass) {
      alignBanner.classList.remove(
        'lv-align--left',
        'lv-align--right',
        'lv-align--around',
      );
      alignBanner.classList.add(sideClass);
      lastCueSide = sideClass;
    }
    alignBanner.classList.remove('hidden');
    alignBanner.style.setProperty('--cue-intensity', cue.intensity.toFixed(3));
    alignBanner.style.setProperty('--cue-scale', cue.scale.toFixed(3));
    alignBanner.style.setProperty('--cue-tilt', `${cue.tiltDeg.toFixed(1)}deg`);

    const icon = document.getElementById('align-icon');
    if (icon && lastCueSymbol !== cue.symbol) {
      icon.textContent = cue.symbol;
      lastCueSymbol = cue.symbol;
    }
    if (alignText && lastCueLabel !== cue.label) {
      alignText.textContent = cue.label;
      lastCueLabel = cue.label;
    }
    return false;
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
      badge.classList.add('hidden');
      return;
    }

    if (mode === 'slam' || mode === 'compass') {
      window.__fplacesArMode = mode;
    }

    if (mode === 'slam-loading') {
      label.textContent = detail || 'Starting AR…';
      badge.className = 'lv-mode-badge lv-mode-badge--loading';
      badge.classList.remove('hidden');
      return;
    }

    if (mode === 'compass') {
      label.textContent = detail || 'Compass mode';
      badge.className = 'lv-mode-badge lv-mode-badge--compass';
      badge.classList.remove('hidden');
      return;
    }

    label.textContent = detail || 'AR mode active';
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
        hideAlignCue(alignBanner);
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
        hideAlignCue(alignBanner);
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
      const compassDelta = window.FplacesSlamHeading?.isActive?.()
        ? null
        : window.FplacesOrientationCompass?.getAlignmentDelta?.(state);
      const headingDelta =
        compassDelta != null && Number.isFinite(compassDelta)
          ? compassDelta
          : guidance.alignmentDelta;

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
        hideAlignCue(alignBanner);
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
      const aligned = applyAlignCue(alignBanner, alignText, headingDelta);

      const turnIconEl = document.getElementById('turn-icon');
      const turnTextEl = document.getElementById('turn-text');
      const distBar = document.getElementById('distance-bar');
      const isStraight = primary.symbol === 'straight' || /straight/i.test(primary.label || '');

      if (turnIconEl) {
        const icon = isStraight ? 'arrow_upward' : primary.symbol;
        if (turnIconEl.dataset.icon !== icon) {
          turnIconEl.dataset.icon = icon;
          turnIconEl.innerHTML = symbolHtml(icon, 'lv-sym-lg');
        }
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
          remaining != null ? formatDistanceCompact(remaining) : '-';
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
      statusEl.classList.toggle('lv-status--error', !!isError);

      if (window.__fplacesAwaitingCameraStart && !isError) {
        statusEl.classList.add('hidden');
        return;
      }

      statusEl.classList.remove('hidden');

      if (isError) {
        setScanOverlay(false);
        document.getElementById('live-nav')?.classList.add('hidden');
        document.getElementById('arrival-card')?.classList.add('hidden');
        hideAlignCue(document.getElementById('align-banner'));
        setNavigating(false);
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
