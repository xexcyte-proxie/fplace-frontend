/**
 * Multi-floor transition metadata and floor-aware path filtering for AR rendering.
 * Vertical geometry is not faked - connectors are tracked for future vertical path support.
 */
(function () {
  const CONNECTION_PATTERNS = [
    { pattern: /elevator/i, kind: 'elevator' },
    { pattern: /escalat/i, kind: 'escalator' },
    { pattern: /stair/i, kind: 'stairs' },
    { pattern: /connection/i, kind: 'connection' },
  ];

  function classifyConnection(step) {
    const text = `${step?.actionType ?? ''} ${step?.instruction ?? ''}`;
    for (const { pattern, kind } of CONNECTION_PATTERNS) {
      if (pattern.test(text)) return kind;
    }
    return 'unknown';
  }

  function ensurePathFloors(path) {
    if (!path?.length) return [];
    const geo = window.FplacesGeoMath;
    const normalized = window.FplacesRouteGeometry?.normalizePath?.(path) || path;
    const enriched = normalized.map((p) => ({ ...p }));

    for (let i = 1; i < enriched.length; i++) {
      if (!enriched[i].floorId && enriched[i - 1].floorId) {
        enriched[i].floorId = enriched[i - 1].floorId;
      }
    }
    for (let i = enriched.length - 2; i >= 0; i--) {
      if (!enriched[i].floorId && enriched[i + 1].floorId) {
        enriched[i].floorId = enriched[i + 1].floorId;
      }
    }
    for (let i = 0; i < enriched.length; i++) {
      if (!enriched[i].floorId) enriched[i].floorId = 'unknown';
    }
    return enriched;
  }

  function detectTransitions(route) {
    const path = ensurePathFloors(route?.pathCoordinates || []);
    const maneuvers = route?.maneuvers || [];
    const transitions = [];

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (a.floorId && b.floorId && a.floorId !== b.floorId) {
        const maneuver = maneuvers.find((m) => {
          const type = `${m?.actionType ?? ''} ${m?.instruction ?? ''}`;
          return /connection|elevator|escalat|stair/i.test(type);
        });
        transitions.push({
          pathIndex: i + 1,
          fromFloorId: a.floorId,
          toFloorId: b.floorId,
          kind: classifyConnection(maneuver),
          instruction: maneuver?.instruction,
        });
      }
    }

    return transitions;
  }

  function filterPathForFloor(path, floorId) {
    if (!floorId || !path?.length) return path || [];
    const enriched = ensurePathFloors(path);
    const segments = [];
    let current = [];

    for (let i = 0; i < enriched.length; i++) {
      const pt = enriched[i];
      if (pt.floorId === floorId) {
        if (!current.length && i > 0) current.push(enriched[i - 1]);
        current.push(pt);
      } else if (current.length) {
        current.push(pt);
        segments.push(current);
        current = [];
      }
    }
    if (current.length) segments.push(current);

    if (!segments.length) return enriched.filter((p) => p.floorId === floorId);
    return segments.reduce((a, b) => (a.length >= b.length ? a : b));
  }

  function isInTransition(path, alongMeters, windowM = 3) {
    const transitions = detectTransitions({ pathCoordinates: path });
    if (!transitions.length) return null;

    const geo = window.FplacesRouteGeometry;
    for (const tr of transitions) {
      const snap = geo?.snapAtDistanceAlongPath?.(path, alongMeters);
      const trSnap = geo?.snapAtDistanceAlongPath?.(
        path,
        geo?.totalPathLengthMeters?.(path.slice(0, tr.pathIndex + 1)) ?? 0,
      );
      if (!snap || !trSnap) continue;
      if (Math.abs(snap.distanceAlongPathMeters - trSnap.distanceAlongPathMeters) <= windowM) {
        return tr;
      }
    }
    return null;
  }

  window.FplacesFloorTransitions = {
    classifyConnection,
    ensurePathFloors,
    detectTransitions,
    filterPathForFloor,
    isInTransition,
  };
})();
