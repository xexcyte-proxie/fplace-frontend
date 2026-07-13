/**
 * Central AR debug logger — console, on-screen panel, and Flutter bridge mirror.
 *
 * Enable:  ?arDebug=1  (default ON)  |  Disable: ?arDebug=0
 * Panel:   ?arPanel=1  (default ON when debug on)
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const cfg = window.FPLACES_AR_CONFIG || {};

  const debugEnabled =
    params.get('arDebug') === '0'
      ? false
      : params.get('arDebug') === '1' || cfg.arDebug !== false;

  const panelEnabled =
    debugEnabled &&
    (params.get('arPanel') === '0'
      ? false
      : params.get('arPanel') === '1' || cfg.arDebugPanel === true);

  let step = 0;
  const t0 = performance.now();
  const panelLines = [];
  const PANEL_MAX = 48;
  let panelEl = null;
  let lastNavLogKey = '';
  let lastNavLogAt = 0;
  const throttledLogAt = new Map();

  function elapsedMs() {
    return Math.round(performance.now() - t0);
  }

  function safeStringify(value, maxLen) {
    if (value == null) return '';
    try {
      const text =
        typeof value === 'string' ? value : JSON.stringify(value, null, 0);
      if (maxLen && text.length > maxLen) {
        return `${text.slice(0, maxLen)}… (+${text.length - maxLen} chars)`;
      }
      return text;
    } catch (_) {
      return String(value);
    }
  }

  function formatLine(level, phase, message, detail) {
    step += 1;
    const detailText = detail != null ? ` | ${safeStringify(detail, 320)}` : '';
    return `STEP ${step} (${elapsedMs()}ms) [${phase}] ${message}${detailText}`;
  }

  function appendPanel(line, level) {
    if (!panelEnabled) return;
    const panel = ensurePanel();
    const color =
      level === 'error'
        ? '#f87171'
        : level === 'warn'
          ? '#fbbf24'
          : '#86efac';
    panelLines.push({ line, color });
    if (panelLines.length > PANEL_MAX) panelLines.shift();
    panel.innerHTML = panelLines
      .map(
        (entry) =>
          `<div style="color:${entry.color};margin:0 0 3px;word-break:break-word">${entry.line}</div>`,
      )
      .join('');
    panel.scrollTop = panel.scrollHeight;
  }

  function ensurePanel() {
    if (panelEl) return panelEl;
    panelEl = document.createElement('div');
    panelEl.id = 'fplaces-ar-debug-panel';
    panelEl.style.cssText =
      'position:fixed;top:8px;left:8px;right:8px;max-height:38vh;overflow:auto;' +
      'z-index:6;pointer-events:none;font:11px/1.35 ui-monospace,Menlo,monospace;' +
      'background:rgba(0,0,0,0.72);border:1px solid rgba(34,197,94,0.35);' +
      'border-radius:10px;padding:8px 10px;color:#86efac;';
    document.body.appendChild(panelEl);
    return panelEl;
  }

  function mirrorToFlutter(level, phase, message, detail) {
    try {
      window.FplacesRouteBridge?.sendToFlutter?.({
        event: 'debug',
        level,
        phase,
        message,
        detail: detail ?? null,
        step,
        elapsedMs: elapsedMs(),
      });
    } catch (_) {}
  }

  function emit(level, phase, message, detail) {
    const line = formatLine(level, phase, message, detail);
    if (level === 'error') {
      console.error(`[fplaces AR] ${line}`);
    } else if (level === 'warn') {
      console.warn(`[fplaces AR] ${line}`);
    } else {
      console.log(`[fplaces AR] ${line}`);
    }
    appendPanel(line, level);
    if (debugEnabled && (panelEnabled || level !== 'log')) {
      mirrorToFlutter(level, phase, message, detail);
    }
    if (window.parent !== window && panelEnabled) {
      try {
        const targetOrigin = (() => {
          const cfgOrigin = window.FPLACES_AR_CONFIG?.pwaOrigin;
          if (cfgOrigin) {
            try {
              return new URL(cfgOrigin).origin;
            } catch (_) {
              return cfgOrigin;
            }
          }
          if (document.referrer) {
            try {
              return new URL(document.referrer).origin;
            } catch (_) {
              /* fall through */
            }
          }
          return '*';
        })();
        window.parent.postMessage(
          { type: 'fplaces_ar_debug', level, phase, message, detail, line },
          targetOrigin,
        );
      } catch (_) {
        /* ignore */
      }
    }
  }

  function routeSummary(route) {
    if (!route) return { route: null };
    const path = route.pathCoordinates || [];
    const maneuvers = route.maneuvers || [];
    return {
      destinationName: route.destinationName,
      pathPoints: path.length,
      maneuverCount: maneuvers.length,
      distanceMeters: route.distanceMeters,
      legCount: route.legCount ?? route.legs?.length,
      currentLegIndex: route.currentLegIndex,
      origin: route.origin,
      destination: route.destination,
      userPosition: route.userPosition,
      firstPathPoint: path[0] || null,
      lastPathPoint: path[path.length - 1] || null,
      sampleManeuvers: maneuvers.slice(0, 3).map((m) => ({
        instruction: m.instruction,
        pathIndex: m.pathIndex,
        headingDegrees: m.headingDegrees,
        actionType: m.actionType,
      })),
    };
  }

  function navState(state) {
    if (!state) return null;
    return {
      instruction: state.instruction,
      maneuverIndex: state.maneuverIndex,
      maneuverCount: state.maneuverCount,
      pathSegmentIndex: state.pathSegmentIndex,
      targetBearingDegrees: state.targetBearingDegrees,
      externalHeadingDegrees: state.externalHeadingDegrees,
      positionSource: state.positionSource,
      hasPosition: state.hasPosition,
      offPathMessage: state.offPathMessage,
      arrived: state.arrived,
      distanceRemainingMeters: state.distanceRemainingMeters,
    };
  }

  function arrowState(target, device, delta, visible) {
    return {
      targetBearingDegrees: target,
      deviceHeadingDegrees: device,
      deltaDegrees: delta,
      arrowVisible: visible,
    };
  }

  function quatToYawDegrees(q) {
    if (!q) return null;
    const siny = 2 * (q.w * q.y + q.x * q.z);
    const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
    return Math.round(((Math.atan2(siny, cosy) * 180) / Math.PI) * 10) / 10;
  }

  function quatTuple(q) {
    if (!q) return null;
    return [
      Math.round(q.x * 1000) / 1000,
      Math.round(q.y * 1000) / 1000,
      Math.round(q.z * 1000) / 1000,
      Math.round(q.w * 1000) / 1000,
    ];
  }

  /** Structured payload for Google AR directional alignment debug. */
  function alignmentState(detail) {
    if (!detail) return null;
    const out = { ...detail };
    if (detail.currentQuat) {
      out.currentYawDeg = quatToYawDegrees(detail.currentQuat);
      out.currentQuat = quatTuple(detail.currentQuat);
    }
    if (detail.targetQuat) {
      out.targetYawDeg = quatToYawDegrees(detail.targetQuat);
      out.targetQuat = quatTuple(detail.targetQuat);
    }
    return out;
  }

  function logThrottled(phase, message, detail, minIntervalMs, keyOverride) {
    if (!debugEnabled) return;
    const key =
      keyOverride ?? `${phase}:${message}:${safeStringify(detail, 160)}`;
    const now = performance.now();
    const min = minIntervalMs ?? 500;
    const lastAt = throttledLogAt.get(key) ?? 0;
    if (now - lastAt < min) return;
    throttledLogAt.set(key, now);
    emit('log', phase, message, detail);
  }

  function logNavStateThrottled(phase, message, state, minIntervalMs) {
    if (!debugEnabled) return;
    const key = safeStringify(navState(state));
    const now = performance.now();
    if (key === lastNavLogKey && now - lastNavLogAt < (minIntervalMs || 800)) {
      return;
    }
    lastNavLogKey = key;
    lastNavLogAt = now;
    emit('log', phase, message, navState(state));
  }

  function showFatalBanner(message) {
    if (window.FplacesLiveViewHud?.setStatus) {
      window.FplacesLiveViewHud.setStatus(message, true);
      return;
    }
    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.background = 'rgba(127,29,29,0.92)';
      statusEl.style.borderColor = 'rgba(248,113,113,0.5)';
    }
    const offPathEl = document.getElementById('offPath');
    if (offPathEl) {
      offPathEl.textContent = message;
    }
  }

  function formatUnknownError(error) {
    if (error == null) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error instanceof Error) {
      return error.message || error.name || String(error);
    }
    if (typeof error.message === 'string') return error.message;
    try {
      return JSON.stringify(error);
    } catch (_) {
      return String(error);
    }
  }

  function previewCameraActive() {
    const video = document.getElementById('camera');
    return !!(video?.srcObject && video.style.display !== 'none');
  }

  function captureRuntimeError(source, error, extra) {
    const message = formatUnknownError(error);
    // Benign race when THREE/XR scripts load twice — ignored after inject guard.
    if (
      /unconfigurable property/i.test(message) ||
      /Attempting to change the getter/i.test(message)
    ) {
      emit('warn', source, message, {
        ...(extra || {}),
        ignored: true,
        hint: 'Duplicate THREE/XR script inject — should be blocked by __fplacesXrScriptsInjected',
      });
      return;
    }
    const isXrSource = String(source || '').startsWith('XR');
    if (window.__fplacesFallbackTriggered && isXrSource) {
      return;
    }
    const stack =
      error && typeof error === 'object' && error.stack
        ? String(error.stack).slice(0, 1200)
        : undefined;
    emit('error', source, message, {
      ...(extra || {}),
      stack,
      errorType: error?.name,
    });
    if (previewCameraActive()) {
      window.FplacesSlamDiagnostics?.log?.('xrError', 'XR error — keeping preview camera', {
        source,
        message,
      });
      return;
    }
    showFatalBanner(`AR error: ${message}`);
    try {
      window.FplacesRouteBridge?.sendToFlutter?.({
        event: 'arRuntimeError',
        message,
        stack,
        source,
      });
    } catch (_) {}
    if (
      !window.__fplacesFallbackTriggered &&
      typeof window.__fplacesStartFallback === 'function'
    ) {
      const xrEngaged =
        window.__fplacesXrRunCalled ||
        window.__fplacesXrSessionActive ||
        window.__fplacesXrAwaitingOnStart;
      if (!xrEngaged) {
        window.FplacesSlamDiagnostics?.log?.('preXrError', 'Error before XR start — not falling back', {
          source,
          message,
        });
        return;
      }
      window.__fplacesStartFallback(`XR failed. Compass mode. ${message}`);
    }
  }

  function installGlobalErrorHooks() {
    window.addEventListener('error', (event) => {
      captureRuntimeError('window.error', event.error || event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      captureRuntimeError('unhandledrejection', event.reason, {
        promise: 'rejected',
      });
    });

    const originalConsoleError = console.error.bind(console);
    console.error = function (...args) {
      const text = args
        .map((arg) => {
          if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
          return formatUnknownError(arg);
        })
        .join(' ');
      if (
        text.includes('[RuntimeError]') ||
        text.includes('XR caught an error') ||
        text.includes('native code called abort')
      ) {
        emit('error', 'XR.Console', text.slice(0, 500));
        showFatalBanner(text.slice(0, 180));
      }
      return originalConsoleError(...args);
    };
  }

  installGlobalErrorHooks();

  window.FplacesArDebug = {
    enabled: debugEnabled,
    panelEnabled,

    reset() {
      step = 0;
      panelLines.length = 0;
      lastNavLogKey = '';
      lastNavLogAt = 0;
      throttledLogAt.clear();
      emit('log', 'Boot', '══════ AR PAGE SESSION START ══════', {
        href: window.location.href,
        userAgent: navigator.userAgent,
        protocol: window.location.protocol,
        debugEnabled,
        panelEnabled,
        xrMode: cfg.xrMode,
        useGpsProgress: cfg.useGpsProgress,
      });
    },

    log(phase, message, detail) {
      if (!debugEnabled) return;
      emit('log', phase, message, detail);
    },

    warn(phase, message, detail) {
      emit('warn', phase, message, detail);
    },

    error(phase, message, detail) {
      emit('error', phase, message, detail);
    },

    routeSummary,
    navState,
    arrowState,
    alignmentState,
    quatToYawDegrees,
    quatTuple,
    logNavStateThrottled,
    logThrottled,

    captureRuntimeError,
    showFatalBanner,

    complete(outcome) {
      emit('log', 'Done', `══════ AR PAGE SESSION END — ${outcome} ══════`);
    },
  };

  window.FplacesArDebug.reset();
})();
