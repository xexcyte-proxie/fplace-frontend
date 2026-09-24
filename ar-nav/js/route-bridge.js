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
      const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const json = new TextDecoder().decode(bytes);
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

  function decodeRouteFromSessionStorage() {
    try {
      const raw = sessionStorage.getItem('fplaces.handoff.route');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      DBG()?.log('Bridge', 'Route decoded from sessionStorage handoff', {
        rawChars: raw.length,
      });
      return parsed;
    } catch (error) {
      DBG()?.error('Bridge', 'SessionStorage route parse failed', {
        error: String(error),
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

  function routeFingerprint(route) {
    if (!route) return '';
    const path = route.pathCoordinates || [];
    const geoHash =
      route.geometryHash ||
      route.pathHash ||
      window.FplacesRouteServices?.computeGeometryHash?.({
        pathCoordinates: path,
        legs: route.legs,
        maneuvers: route.maneuvers,
        routeVersion: route.routeVersion,
        generatedAt: route.generatedAt,
      }) ||
      window.FplacesGeoMath?.pathGeometryHash?.(path) ||
      '';
    return [
      route.routeId || '',
      route.routeVersion ?? 1,
      route.generatedAt ?? '',
      geoHash,
    ].join('|');
  }

  function routesAreEquivalent(a, b) {
    if (!a || !b) return false;
    if (a.routeId && b.routeId && a.routeId === b.routeId) {
      if ((a.routeVersion ?? 1) !== (b.routeVersion ?? 1)) return false;
      const hashA = a.geometryHash || a.pathHash || '';
      const hashB = b.geometryHash || b.pathHash || '';
      return hashA && hashB && hashA === hashB;
    }
    return routeFingerprint(a) === routeFingerprint(b);
  }

  function ensureRouteFloors(route) {
    if (!route?.pathCoordinates?.length) return route;
    const ensure = window.FplacesFloorTransitions?.ensurePathFloors;
    if (ensure) {
      route.pathCoordinates = ensure(route.pathCoordinates);
    } else {
      route.pathCoordinates = route.pathCoordinates.map((p) => ({
        ...p,
        floorId: p.floorId || 'unknown',
      }));
    }
    return route;
  }

  function normalizeRoute(payload) {
    if (!payload || payload.type === 'route_stop') {
      DBG()?.warn('Bridge', 'normalizeRoute rejected payload', {
        type: payload?.type,
        hasPayload: !!payload,
      });
      return null;
    }

    const services = window.FplacesRouteServices;
    const validation = services?.validateRoute?.(payload);
    if (validation && !validation.valid) {
      DBG()?.error('Bridge', 'Route validation failed', {
        errors: validation.errors,
        routeId: payload.routeId,
      });
      window.FplacesLiveViewHud?.setStatus?.(
        `Route rejected: ${validation.errors[0] || 'validation failed'}`,
        true,
      );
      services?.sendRouteAck?.(payload, false, validation.errors.join('; '));
      return null;
    }

    const versionCheck = services?.shouldAcceptRoute?.(payload);
    if (versionCheck && !versionCheck.accept) {
      DBG()?.log('Bridge', 'Route rejected by version negotiation', versionCheck);
      services?.sendRouteAck?.(payload, false, versionCheck.reason);
      return null;
    }

    const geometryHash =
      payload.geometryHash ||
      payload.pathHash ||
      services?.computeGeometryHash?.({
        pathCoordinates: payload.pathCoordinates,
        legs: payload.legs,
        maneuvers: payload.maneuvers,
        routeVersion: payload.routeVersion,
        generatedAt: payload.generatedAt,
      }) ||
      '';

    const normalized = {
      type: payload.type || 'route_update',
      legCount: payload.legCount ?? payload.legs?.length ?? 0,
      currentLegIndex: payload.currentLegIndex ?? 0,
      instructions: payload.instructions || '',
      destinationName: payload.destinationName || 'Destination',
      destinationFloorName: payload.destinationFloorName || '',
      destinationAreaHint: payload.destinationAreaHint || '',
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
      floors: Array.isArray(payload.floors) ? payload.floors : [],
      floorTransitions: Array.isArray(payload.floorTransitions)
        ? payload.floorTransitions
        : [],
      routeId: payload.routeId || '',
      routeVersion: payload.routeVersion ?? 1,
      generatedAt: payload.generatedAt ?? null,
      updatedAt: payload.updatedAt ?? payload.generatedAt ?? null,
      geometryHash,
      checksum: payload.checksum || '',
      mapVersion: payload.mapVersion || payload.mapId || '',
      venueId: payload.venueId || payload.mapId || '',
      routingEngineVersion: payload.routingEngineVersion || services?.ROUTING_ENGINE_VERSION || '',
      pathHash: geometryHash,
      positioningMode: payload.positioningMode || null,
      navigationMode: payload.navigationMode || 'walk',
      lifecycle: payload.lifecycle || null,
      navigationProgress: payload.navigationProgress || null,
      partialUpdate: !!payload.partialUpdate,
      syncReason: payload.syncReason || null,
    };
    return ensureRouteFloors(normalized);
  }

  function applyNavigationSync(progress, source) {
    if (!progress || typeof progress.alongPathMeters !== "number") return;
    window.__fplacesNavigationProgress = progress;
    if (
      isParentEmbeddedNav() &&
      (progress.navigationAuthority === "parent-simulator" ||
        progress.source === "simulator" ||
        progress.routeSimulating)
    ) {
      window.__fplacesParentSimulatorAuthority = true;
    }
    DBG()?.log('Bridge', `applyNavigationSync from ${source || 'unknown'}`, {
      alongPathMeters: progress.alongPathMeters,
      routeSimulating: progress.routeSimulating,
      navigationAuthority: progress.navigationAuthority,
    });
    const nav = window.__fplacesNavigator;
    if (nav?.applyNavigationSync) {
      nav.applyNavigationSync(progress);
      return;
    }
    window.__fplacesPendingNavigationSync = progress;
  }

  function isParentEmbeddedNav() {
    const cfg = window.FPLACES_AR_CONFIG || {};
    return cfg.useGpsProgress === false;
  }

  function buildSimulatorProgressFromPosition(position) {
    const path = window.fplacesActiveRoute?.pathCoordinates || [];
    const total = path.length
      ? window.FplacesRouteGeometry.totalPathLengthMeters(path)
      : 0;
    const along = position.alongPathMeters;
    return {
      ...(window.__fplacesNavigationProgress || {}),
      alongPathMeters: along,
      routeTraveledMeters: along,
      routeRemainingMeters: Math.max(0, total - along),
      routeSimulating: true,
      routeSimulationComplete: false,
      source: "simulator",
      navigationAuthority: isParentEmbeddedNav() ? "parent-simulator" : "local",
      latitude: position.latitude,
      longitude: position.longitude,
      heading: position.heading,
      floorId: position.floorId,
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
      timestamp: payload.timestamp != null ? Number(payload.timestamp) : Date.now(),
      alongPathMeters:
        payload.alongPathMeters != null ? Number(payload.alongPathMeters) : undefined,
    };
  }

  const pendingPositions = [];

  const LOCAL_DEV_ORIGIN =
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

  const LAN_DEV_ORIGIN =
    /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

  let capturedParentOrigin = null;

  function normalizeOriginEntry(entry) {
    if (!entry || typeof entry !== 'string') return null;
    try {
      return entry.includes('://') ? new URL(entry).origin : new URL(`https://${entry}`).origin;
    } catch {
      return entry;
    }
  }

  function resolveProductionPwaOrigins() {
    const cfg = window.FPLACES_AR_CONFIG || {};
    return [cfg.pwaOrigin, cfg.pwaHost]
      .map(normalizeOriginEntry)
      .filter(Boolean);
  }

  function isStructurallyAllowedOrigin(origin) {
    if (!origin || typeof origin !== 'string') return false;
    if (origin === window.location.origin) return true;
    if (LOCAL_DEV_ORIGIN.test(origin)) return true;
    if (LAN_DEV_ORIGIN.test(origin)) return true;
    if (resolveProductionPwaOrigins().includes(origin)) return true;
    return false;
  }

  function isAllowedMessageOrigin(origin) {
    if (!isStructurallyAllowedOrigin(origin)) return false;
    if (capturedParentOrigin == null) {
      capturedParentOrigin = origin;
      DBG()?.log('Bridge', 'Captured trusted parent origin', { origin });
      return true;
    }
    return origin === capturedParentOrigin;
  }

  function flushPendingPositions() {
    const nav = window.__fplacesNavigator;
    if (!nav || typeof nav.applyPosition !== 'function') return;
    while (pendingPositions.length) {
      const item = pendingPositions.shift();
      nav.applyPosition(item.position);
    }
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
    flushPendingPositions,
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
        routeId: payload?.routeId,
        routeVersion: payload?.routeVersion,
      });
      const route = normalizeRoute(payload);
      if (!route) return null;

      const fp = routeFingerprint(route);
      const nav = window.__fplacesNavigator;
      const duplicateRoute =
        fp &&
        fp === window.__fplacesActiveRouteFp &&
        window.fplacesActiveRoute &&
        routesAreEquivalent(route, window.fplacesActiveRoute);
      const navigationUnderway =
        nav &&
        (nav.positionSource === 'simulator' ||
          nav.positionSource === 'calibrate' ||
          nav.lastPosition?.source === 'simulator' ||
          (nav.maneuverIndex ?? 0) > 0 ||
          nav.arrived);

      const isLegOrStateSync =
        route.partialUpdate ||
        route.syncReason === 'leg_change' ||
        route.syncReason === 'floor_change';

      if (duplicateRoute && navigationUnderway && !isLegOrStateSync) {
        DBG()?.log('Bridge', 'applyRoute skipped - identical geometry, preserving progress', {
          source,
          maneuverIndex: nav?.maneuverIndex,
        });
        window.fplacesActiveRoute = { ...window.fplacesActiveRoute, ...route };
        if (route.navigationProgress) {
          applyNavigationSync(
            route.navigationProgress,
            `${source || 'unknown'}-handoff-resync`,
          );
        }
        window.FplacesRouteServices?.sendRouteAck?.(route, true, 'duplicate-preserved');
        return route;
      }

      window.__fplacesActiveRouteFp = fp;
      window.fplacesActiveRoute = route;
      window.FplacesRouteServices?.recordAccepted?.(route);
      if (route.navigationProgress) {
        window.__fplacesNavigationProgress = route.navigationProgress;
      }
      DBG()?.log('Bridge', 'Route normalized & stored', DBG().routeSummary(route));
      emitRoute(route);
      if (route.navigationProgress) {
        applyNavigationSync(route.navigationProgress, `${source || 'unknown'}-handoff`);
      }
      window.FplacesRouteServices?.sendRouteAck?.(route, true, 'accepted');
      sendToFlutter({ event: 'sessionReady' });
      return route;
    },

    applyNavigationSync(progress, source) {
      applyNavigationSync(progress, source);
    },

    applyPosition(payload, source) {
      const position = normalizePosition(payload);
      if (!position) return false;

      const dedupeKey = [
        position.timestamp ?? '',
        position.latitude,
        position.longitude,
        position.heading ?? '',
        position.alongPathMeters ?? '',
      ].join('|');
      if (window.__fplacesLastAppliedPositionKey === dedupeKey) {
        return true;
      }
      window.__fplacesLastAppliedPositionKey = dedupeKey;

      window.__fplacesLastPositionFrame = position;
      const nav = window.__fplacesNavigator;

      if (
        isParentEmbeddedNav() &&
        position.source === 'simulator' &&
        typeof position.alongPathMeters === 'number'
      ) {
        const progress = buildSimulatorProgressFromPosition(position);
        window.__fplacesNavigationProgress = progress;
        window.__fplacesParentSimulatorAuthority = true;
        DBG()?.log('Bridge', `applyPosition → parent simulator sync from ${source || 'unknown'}`, {
          alongPathMeters: position.alongPathMeters,
        });
        if (nav?.applyNavigationSync) {
          nav.applyNavigationSync(progress);
          return true;
        }
        window.__fplacesPendingNavigationSync = progress;
        return false;
      }

      if (
        position.source === 'simulator' &&
        typeof position.alongPathMeters === 'number'
      ) {
        window.__fplacesNavigationProgress = buildSimulatorProgressFromPosition(position);
      }
      DBG()?.log('Bridge', `applyPosition from ${source || 'unknown'}`, position);
      if (nav && typeof nav.applyPosition === 'function') {
        nav.applyPosition(position);
        if (window.__fplacesXrScene && window.FplacesCameraStart?.isStarted?.()) {
          window.__fplacesTryAutoCalibrate?.('position');
        }
        return true;
      }
      pendingPositions.push({ position, source });
      if (pendingPositions.length > 60) pendingPositions.shift();
      DBG()?.warn('Bridge', 'applyPosition - navigator not ready yet', {
        hasNavigator: !!nav,
      });
      return false;
    },

    loadInitialRoute() {
      // Bootstrap fallback: sessionStorage (parent handoff) → URL hash → query.
      // Runtime delivery uses direct bridge → postMessage (higher priority).
      const fromSession = decodeRouteFromSessionStorage();
      if (fromSession) return fromSession;
      const fromHash = decodeRouteFromHash();
      if (fromHash) return fromHash;
      const fromQuery = decodeRouteFromQuery();
      if (fromQuery) return fromQuery;
      DBG()?.warn('Bridge', 'No initial route in sessionStorage, URL hash, or query');
      return null;
    },

    requestParentMovement(options = {}) {
      const alongPathMeters =
        typeof options.alongPathMeters === 'number' ? options.alongPathMeters : undefined;

      try {
        const parent = window.parent;
        if (parent && parent !== window && parent.__fplacesMapApp?.startRouteMovement) {
          parent.__fplacesMapApp.startRouteMovement({ alongPathMeters });
          DBG()?.log('Bridge', 'Requested parent route movement (direct)', { alongPathMeters });
          return true;
        }
      } catch (error) {
        DBG()?.warn('Bridge', 'Direct parent movement request failed', {
          error: String(error),
        });
      }

      try {
        const cfg = window.FPLACES_AR_CONFIG || {};
        const target = cfg.pwaOrigin || window.location.origin;
        window.parent?.postMessage?.(
          { type: 'fplaces_start_movement', alongPathMeters },
          target,
        );
        DBG()?.log('Bridge', 'Requested parent route movement (postMessage fallback)', {
          target,
          alongPathMeters,
        });
        return true;
      } catch (error) {
        DBG()?.warn('Bridge', 'postMessage parent movement request failed', {
          error: String(error),
        });
      }

      return false;
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
    DBG()?.log('Bridge', 'onFlutterStop - clearing active route');
    window.fplacesActiveRoute = null;
    window.__fplacesActiveRouteFp = null;
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

  window.addEventListener('message', (event) => {
    if (!isAllowedMessageOrigin(event.origin)) {
      DBG()?.warn('Bridge', 'Rejected postMessage from untrusted origin', {
        origin: event.origin,
        capturedParentOrigin,
      });
      return;
    }
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'fplaces_route' && data.route) {
      DBG()?.log('Bridge', 'Route received via postMessage from parent PWA');
      window.FplacesRouteBridge.applyRoute(data.route, 'postMessage-route');
      return;
    }
    if (data.type === 'fplaces_position' && data.position) {
      window.FplacesRouteBridge.applyPosition(data.position, 'postMessage');
      return;
    }
    if (data.type === 'FPLACES_POSITION_UPDATE' && data.data) {
      window.FplacesRouteBridge.applyPosition(data.data, 'postMessage-v2');
      return;
    }
    if (data.type === 'fplaces_simulator_started') {
      DBG()?.log('Bridge', 'Parent simulator armed', data);
      const nav = window.__fplacesNavigator;
      if (nav) {
        if (typeof nav.applyArrivalLatch === 'function') {
          nav.applyArrivalLatch(null, { forceClear: true });
        } else {
          nav.arrived = false;
          nav._arrivalNotifiedToParent = false;
        }
        nav.offPathMessage = '';
      }
      if (typeof data.alongPathMeters === 'number') {
        const progress = {
          ...(window.__fplacesNavigationProgress || {}),
          alongPathMeters: data.alongPathMeters,
          routeTraveledMeters: data.alongPathMeters,
          routeSimulating: true,
          routeSimulationComplete: false,
          source: 'simulator',
          navigationAuthority: isParentEmbeddedNav() ? 'parent-simulator' : 'local',
        };
        applyNavigationSync(progress, 'simulator_started');
      }
      return;
    }
    if (data.type === 'fplaces_permissions') {
      DBG()?.log('Bridge', 'Parent permission state', { camera: data.camera });
      window.FplacesCameraStart?.applyParentPermissions?.(data);
      return;
    }
    if (data.type === 'fplaces_activate') {
      if (data.route) {
        window.FplacesRouteBridge.applyRoute(data.route, 'postMessage-activate');
      }
      window.__fplacesActivateLiveView?.(data.launch || {});
      return;
    }
    if (data.type === 'fplaces_navigation_sync' && data.progress) {
      DBG()?.log('Bridge', 'Navigation sync from parent PWA', data.progress);
      applyNavigationSync(data.progress, 'postMessage-sync');
      return;
    }
    if (data.type === 'fplaces_navigation_state' && data.route) {
      DBG()?.log('Bridge', 'Navigation state update from parent', {
        reason: data.reason,
        currentLegIndex: data.currentLegIndex,
      });
      const merged = {
        ...data.route,
        currentLegIndex: data.currentLegIndex ?? data.route.currentLegIndex,
        instructions: data.instructions ?? data.route.instructions,
        partialUpdate: true,
        syncReason: data.reason || 'state_sync',
      };
      window.FplacesRouteBridge.applyRoute(merged, 'postMessage-nav-state');
    }
  });

  const initial = window.FplacesRouteBridge.loadInitialRoute();
  if (initial) {
    window.FplacesRouteBridge.applyRoute(initial, 'URL initial load');
  }
})();
