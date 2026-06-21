/**
 * Flutter ↔ AR route bridge.
 * Loads route JSON from URL hash (#route=base64) or window.onFlutterRoute().
 */
(function () {
  const DBG = () => window.FplacesArDebug;
  const listeners = new Set();

  function decodeRouteFromHash() {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!hash.startsWith('route=')) return null;
    try {
      const b64 = hash.slice('route='.length);
      const json = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
      const parsed = JSON.parse(json);
      DBG()?.log('Bridge', 'Route decoded from URL hash', {
        hashChars: hash.length,
        b64Chars: b64.length,
      });
      return parsed;
    } catch (error) {
      DBG()?.error('Bridge', 'Hash route parse failed', {
        error: String(error),
        hashPrefix: hash.slice(0, 32),
      });
      return null;
    }
  }

  function decodeRouteFromQuery() {
    const raw = new URLSearchParams(window.location.search).get('fplacesRoute');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      DBG()?.log('Bridge', 'Route decoded from query param fplacesRoute', {
        rawChars: raw.length,
      });
      return parsed;
    } catch (error) {
      DBG()?.error('Bridge', 'Query route parse failed', {
        error: String(error),
        rawPrefix: raw.slice(0, 80),
      });
      return null;
    }
  }

  function normalizeRoute(payload) {
    if (!payload || payload.type === 'route_stop') {
      DBG()?.warn('Bridge', 'normalizeRoute rejected payload', {
        type: payload?.type,
        hasPayload: !!payload,
      });
      return null;
    }
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
      userPosition: payload.userPosition || null,
      pathCoordinates: Array.isArray(payload.pathCoordinates)
        ? payload.pathCoordinates
        : [],
      maneuvers: Array.isArray(payload.maneuvers) ? payload.maneuvers : [],
      legs: Array.isArray(payload.legs) ? payload.legs : [],
    };
  }

  function normalizePosition(payload) {
    if (!payload || payload.latitude == null || payload.longitude == null) {
      DBG()?.warn('Bridge', 'normalizePosition rejected payload', payload);
      return null;
    }
    return {
      latitude: Number(payload.latitude),
      longitude: Number(payload.longitude),
      heading:
        payload.heading != null
          ? Number(payload.heading)
          : payload.headingDegrees != null
            ? Number(payload.headingDegrees)
            : undefined,
      accuracy:
        payload.accuracy != null
          ? Number(payload.accuracy)
          : payload.accuracyMeters != null
            ? Number(payload.accuracyMeters)
            : undefined,
      floorId: payload.floorId || null,
      source: payload.source || 'flutter',
    };
  }

  function emitRoute(route) {
    DBG()?.log('Bridge', `Emitting route to ${listeners.size} listener(s)`, {
      hasRoute: !!route,
    });
    for (const fn of listeners) {
      try {
        fn(route);
      } catch (error) {
        DBG()?.error('Bridge', 'Route listener threw', { error: String(error) });
      }
    }
  }

  function sendToFlutter(event) {
    try {
      const msg = JSON.stringify(event);
      const hasFlutterBridge = !!(
        window.ArBridge?.postMessage || window.webkit?.messageHandlers?.ArBridge
      );
      if (event?.event !== 'debug') {
        DBG()?.log('Bridge', `sendToFlutter → ${event?.event || 'unknown'}`, {
          hasFlutterBridge,
          payloadKeys: event ? Object.keys(event) : [],
        });
      }
      if (window.ArBridge?.postMessage) {
        window.ArBridge.postMessage(msg);
      } else if (window.webkit?.messageHandlers?.ArBridge) {
        window.webkit.messageHandlers.ArBridge.postMessage(msg);
      }
    } catch (error) {
      DBG()?.error('Bridge', 'sendToFlutter failed', { error: String(error) });
    }
  }

  window.FplacesRouteBridge = {
    onRoute(callback) {
      listeners.add(callback);
      DBG()?.log('Bridge', 'onRoute listener registered', {
        listenerCount: listeners.size,
      });
      return () => listeners.delete(callback);
    },

    applyRoute(payload, source) {
      DBG()?.log('Bridge', `applyRoute from ${source || 'unknown'}`, {
        payloadType: payload?.type,
        rawPathPoints: payload?.pathCoordinates?.length,
        rawManeuvers: payload?.maneuvers?.length,
      });
      const route = normalizeRoute(payload);
      if (!route) return null;
      window.fplacesActiveRoute = route;
      const summary = DBG().routeSummary(route);
      if (route.userPosition && route.pathCoordinates?.length) {
        const user = route.userPosition;
        const start = route.pathCoordinates[0];
        const geo = window.FplacesRouteGeometry;
        if (geo?.haversineMeters && user.latitude != null && start?.latitude != null) {
          const gapM = Math.round(
            geo.haversineMeters(
              { latitude: user.latitude, longitude: user.longitude },
              { latitude: start.latitude, longitude: start.longitude },
            ),
          );
          summary.userToPathStartMeters = gapM;
          if (gapM > 1500) {
            DBG()?.warn('Bridge', 'User position far from route start — GPS/map mismatch likely', {
              gapMeters: gapM,
              userPosition: route.userPosition,
              pathStart: start,
            });
          }
        }
      }
      DBG()?.log('Bridge', 'Route normalized & stored', summary);
      emitRoute(route);
      sendToFlutter({ event: 'sessionReady' });
      return route;
    },

    applyPosition(payload, source) {
      const position = normalizePosition(payload);
      if (!position) return false;
      const nav = window.__fplacesNavigator;
      DBG()?.log('Bridge', `applyPosition from ${source || 'unknown'}`, position);
      if (nav && typeof nav.applyPosition === 'function') {
        nav.applyPosition(position);
        return true;
      }
      DBG()?.warn('Bridge', 'applyPosition — navigator not ready yet', {
        hasNavigator: !!nav,
      });
      return false;
    },

    loadInitialRoute() {
      const fromHash = decodeRouteFromHash();
      if (fromHash) return fromHash;
      const fromQuery = decodeRouteFromQuery();
      if (fromQuery) return fromQuery;
      DBG()?.warn('Bridge', 'No initial route in URL hash or query');
      return null;
    },

    sendToFlutter,
  };

  window.onFlutterRoute = function (payload) {
    window.FplacesRouteBridge.applyRoute(payload, 'onFlutterRoute');
  };

  window.onFlutterPosition = function (payload) {
    window.FplacesRouteBridge.applyPosition(payload, 'onFlutterPosition');
  };

  window.onFlutterStop = function () {
    DBG()?.log('Bridge', 'onFlutterStop — clearing active route');
    window.fplacesActiveRoute = null;
    emitRoute(null);
    sendToFlutter({ event: 'trackingLost' });
    DBG()?.complete('stopped by Flutter');
  };

  DBG()?.log('Bridge', 'Route bridge initialized', {
    hasInitialHash: window.location.hash.includes('route='),
    hasQueryRoute: !!new URLSearchParams(window.location.search).get('fplacesRoute'),
    hasOnFlutterRoute: typeof window.onFlutterRoute === 'function',
    hasOnFlutterPosition: typeof window.onFlutterPosition === 'function',
  });

  const initial = window.FplacesRouteBridge.loadInitialRoute();
  if (initial) {
    window.FplacesRouteBridge.applyRoute(initial, 'URL initial load');
  }
})();
