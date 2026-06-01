/**
 * Flutter ↔ AR route bridge.
 * Loads route JSON from URL hash (#route=base64) or window.onFlutterRoute().
 */
(function () {
  const listeners = new Set();

  function decodeRouteFromHash() {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!hash.startsWith('route=')) return null;
    try {
      const b64 = hash.slice('route='.length);
      const json = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch (error) {
      console.warn('[fplaces] hash route parse failed', error);
      return null;
    }
  }

  function decodeRouteFromQuery() {
    const raw = new URLSearchParams(window.location.search).get('fplacesRoute');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn('[fplaces] query route parse failed', error);
      return null;
    }
  }

  function normalizeRoute(payload) {
    if (!payload || payload.type === 'route_stop') return null;
    return {
      type: payload.type || 'route_update',
      legCount: payload.legCount ?? payload.legs?.length ?? 0,
      currentLegIndex: payload.currentLegIndex ?? 0,
      instructions: payload.instructions || '',
      destinationName: payload.destinationName || 'Destination',
      distanceMeters: payload.distanceMeters ?? null,
      durationSeconds: payload.durationSeconds ?? null,
      mapId: payload.mapId || payload.mappedinMapId || '',
      origin: payload.origin || null,
      destination: payload.destination || null,
      pathCoordinates: Array.isArray(payload.pathCoordinates)
        ? payload.pathCoordinates
        : [],
      maneuvers: Array.isArray(payload.maneuvers) ? payload.maneuvers : [],
      legs: Array.isArray(payload.legs) ? payload.legs : [],
    };
  }

  function emitRoute(route) {
    for (const fn of listeners) {
      try {
        fn(route);
      } catch (error) {
        console.error('[fplaces] route listener error', error);
      }
    }
  }

  function sendToFlutter(event) {
    try {
      const msg = JSON.stringify(event);
      if (window.ArBridge?.postMessage) {
        window.ArBridge.postMessage(msg);
      } else if (window.webkit?.messageHandlers?.ArBridge) {
        window.webkit.messageHandlers.ArBridge.postMessage(msg);
      }
    } catch (_) {}
  }

  window.FplacesRouteBridge = {
    onRoute(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    applyRoute(payload) {
      const route = normalizeRoute(payload);
      if (!route) return null;
      window.fplacesActiveRoute = route;
      emitRoute(route);
      sendToFlutter({ event: 'sessionReady' });
      return route;
    },

    loadInitialRoute() {
      return (
        decodeRouteFromHash() ||
        decodeRouteFromQuery() ||
        null
      );
    },

    sendToFlutter,
  };

  window.onFlutterRoute = function (payload) {
    window.FplacesRouteBridge.applyRoute(payload);
  };

  window.onFlutterStop = function () {
    window.fplacesActiveRoute = null;
    emitRoute(null);
    sendToFlutter({ event: 'trackingLost' });
  };

  const initial = window.FplacesRouteBridge.loadInitialRoute();
  if (initial) {
    window.FplacesRouteBridge.applyRoute(initial);
  }
})();
