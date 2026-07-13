/**
 * AR-side route services — validation, version negotiation, geometry hashing.
 * Mirrors mappedin-pwa/src/routing/* for consistent cross-client behavior.
 */
(function () {
  const ROUTING_ENGINE_VERSION = 'fplaces-routing/2.0';

  function computeGeometryHash(input) {
    const path = input.pathCoordinates || [];
    const legs = input.legs || [];
    const maneuvers = input.maneuvers || [];
    let hash = 2166136261;
    const mix = (value) => {
      hash ^= value;
      hash = Math.imul(hash, 16777619);
    };

    mix(path.length);
    for (const p of path) {
      mix(Math.round(p.latitude * 1e7));
      mix(Math.round(p.longitude * 1e7));
      const floor = p.floorId || '';
      for (let i = 0; i < floor.length; i++) mix(floor.charCodeAt(i));
      if (p.legId) {
        for (let i = 0; i < p.legId.length; i++) mix(p.legId.charCodeAt(i));
      }
      if (p.segmentIndex != null) mix(p.segmentIndex);
      if (p.distanceAlongRoute != null) mix(Math.round(p.distanceAlongRoute * 100));
    }

    mix(legs.length);
    for (const leg of legs) {
      mix(leg.index);
      const floor = leg.floorId || '';
      for (let i = 0; i < floor.length; i++) mix(floor.charCodeAt(i));
      mix(leg.startIndex);
      mix(leg.endIndex);
      mix(Math.round((leg.distanceMeters || 0) * 100));
      const kind = leg.transitionType || '';
      for (let i = 0; i < kind.length; i++) mix(kind.charCodeAt(i));
      mix((leg.steps || []).length);
    }

    mix(maneuvers.length);
    for (const m of maneuvers) {
      const text = `${m.instruction || ''}|${m.actionType || ''}|${m.legIndex ?? ''}|${m.stepIndex ?? ''}`;
      for (let i = 0; i < text.length; i++) mix(text.charCodeAt(i));
      if (m.distanceMeters != null) mix(Math.round(m.distanceMeters * 100));
    }

    if (input.routeVersion != null) mix(input.routeVersion);
    if (input.generatedAt != null) mix(Math.floor(input.generatedAt / 1000));

    return (hash >>> 0).toString(36);
  }

  function computeRouteChecksum(input) {
    const raw = [
      input.routeId,
      input.routeVersion,
      input.geometryHash,
      input.generatedAt,
      input.pathLength,
    ].join(':');
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function validateRoute(payload) {
    const errors = [];
    const warnings = [];

    if (!payload) return { valid: false, errors: ['null payload'], warnings };

    if (!payload.routeId) errors.push('Missing routeId');
    if (payload.routeVersion == null || payload.routeVersion < 1) errors.push('Invalid routeVersion');
    if (!payload.generatedAt) errors.push('Missing generatedAt');

    const path = payload.pathCoordinates;
    if (!Array.isArray(path) || path.length < 2) {
      errors.push('pathCoordinates must have at least 2 points');
    } else {
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) {
          errors.push(`Invalid coordinates at index ${i}`);
        }
        if (!p.floorId) errors.push(`Missing floorId at index ${i}`);
      }
    }

    if (payload.checksum && payload.geometryHash && payload.routeId) {
      const expected = computeRouteChecksum({
        routeId: payload.routeId,
        routeVersion: payload.routeVersion ?? 1,
        geometryHash: payload.geometryHash || payload.pathHash || '',
        generatedAt: payload.generatedAt,
        pathLength: path?.length ?? 0,
      });
      if (payload.checksum !== expected) errors.push('Checksum mismatch');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  const versionState = {
    latest: null,
  };

  function shouldAcceptRoute(incoming) {
    if (!incoming?.routeId) return { accept: false, reason: 'missing routeId' };

    const current = versionState.latest;
    if (!current) return { accept: true, reason: 'first route' };

    if (incoming.routeId !== current.routeId) {
      if (incoming.generatedAt >= current.generatedAt) return { accept: true, reason: 'new routeId' };
      return { accept: false, reason: 'stale routeId' };
    }

    if ((incoming.routeVersion ?? 1) < (current.routeVersion ?? 1)) {
      return { accept: false, reason: 'older version' };
    }

    if (
      (incoming.routeVersion ?? 1) === (current.routeVersion ?? 1) &&
      incoming.generatedAt < current.generatedAt
    ) {
      return { accept: false, reason: 'stale timestamp' };
    }

    const inHash = incoming.geometryHash || incoming.pathHash || '';
    const curHash = current.geometryHash || current.pathHash || '';
    if (
      (incoming.routeVersion ?? 1) === (current.routeVersion ?? 1) &&
      inHash === curHash
    ) {
      return { accept: false, reason: 'duplicate version' };
    }

    if (incoming.partialUpdate && !incoming.pathCoordinates?.length) {
      return { accept: false, reason: 'partial update missing path' };
    }

    return { accept: true, reason: 'newer version' };
  }

  function recordAccepted(route) {
    versionState.latest = {
      routeId: route.routeId,
      routeVersion: route.routeVersion ?? 1,
      generatedAt: route.generatedAt,
      geometryHash: route.geometryHash || route.pathHash || '',
      pathHash: route.pathHash || route.geometryHash || '',
    };
  }

  function sendRouteAck(route, accepted, reason) {
    const msg = {
      type: 'fplaces_route_ack',
      routeId: route.routeId,
      routeVersion: route.routeVersion ?? 1,
      accepted,
      reason: reason || '',
      generatedAt: route.generatedAt,
    };
    try {
      const cfg = window.FPLACES_AR_CONFIG || {};
      const target = cfg.pwaOrigin || window.location.origin;
      window.parent?.postMessage?.(msg, target);
    } catch {
      /* cross-origin */
    }
  }

  window.FplacesRouteServices = {
    ROUTING_ENGINE_VERSION,
    computeGeometryHash,
    computeRouteChecksum,
    validateRoute,
    shouldAcceptRoute,
    recordAccepted,
    sendRouteAck,
    geometryHash: computeGeometryHash,
  };
})();
