/**
 * Geometry helpers for route snapping and along-path distances.
 * All geodetic math delegates to FplacesGeoMath (single coordinate model).
 */
(function () {
  const geo = () => window.FplacesGeoMath;

  function haversineMeters(a, b) {
    return geo().haversineMeters(a, b);
  }

  /** Unified local projection — identical pre- and post-calibration. */
  function toLocalMeters(ref, p) {
    return geo().geoToLocal2D(ref, p);
  }

  /** @deprecated Alias for toLocalMeters — same equirectangular model everywhere. */
  function toGeographicLocalMeters(ref, p) {
    return toLocalMeters(ref, p);
  }

  function segmentLengthMeters(a, b) {
    return geo().segmentHorizontalMeters(a, b);
  }

  function projectPointOnSegment(point, a, b) {
    const ap = toLocalMeters(a, point);
    const ab = toLocalMeters(a, b);
    const abLen2 = ab.x * ab.x + ab.y * ab.y;
    let t = abLen2 > 0 ? (ap.x * ab.x + ap.y * ab.y) / abLen2 : 0;
    t = Math.max(0, Math.min(1, t));

    const proj = { x: ab.x * t, y: ab.y * t };
    const dx = ap.x - proj.x;
    const dy = ap.y - proj.y;
    const distToSegment = Math.sqrt(dx * dx + dy * dy);

    return {
      t,
      distToSegment,
      segLen: Math.sqrt(abLen2),
      latitude: a.latitude + t * (b.latitude - a.latitude),
      longitude: a.longitude + t * (b.longitude - a.longitude),
      floorId: geo().floorIdAtT(a, b, t),
      legId: t < 0.5 ? a.legId || b.legId : b.legId || a.legId,
    };
  }

  function segmentOnFloor(a, b, floorId) {
    if (!floorId) return true;
    const aFloor = a.floorId || null;
    const bFloor = b.floorId || null;
    if (!aFloor && !bFloor) return false;
    return aFloor === floorId || bFloor === floorId;
  }

  function normalizePath(path) {
    return path
      .map((p) => {
        const latP = p.latitude ?? p.lat;
        const lngP = p.longitude ?? p.lng;
        if (latP == null || lngP == null) return null;
        return {
          latitude: Number(latP),
          longitude: Number(lngP),
          floorId: p.floorId || 'unknown',
          legId: p.legId,
          segmentIndex: p.segmentIndex,
          distanceAlongRoute: p.distanceAlongRoute,
        };
      })
      .filter(Boolean);
  }

  function snapToRoute(path, lat, lng, options) {
    const floorId = options?.floorId || null;
    const legId = options?.legId || null;
    const currentLegIndex = options?.currentLegIndex;
    const legs = options?.legs || null;
    const preferVenue = !!options?.preferVenue;
    const floorMismatchPenalty = preferVenue ? 40 : 80;
    const wrongLegPenalty = 25;
    const futureLegPenalty = 50;
    const previousLegPenalty = 15;
    const wrongConnectorPenalty = 60;
    const normalized = normalizePath(path);
    if (!normalized.length) return null;
    path = normalized;

    if (path.length === 1) {
      return {
        latitude: path[0].latitude,
        longitude: path[0].longitude,
        segmentIndex: 0,
        t: 0,
        distanceAlongPathMeters: 0,
        offRouteMeters: haversineMeters({ latitude: lat, longitude: lng }, path[0]),
        floorId: path[0].floorId,
        legId: path[0].legId,
      };
    }

    let best = null;
    let cumulative = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const segLen = segmentLengthMeters(path[i], path[i + 1]);
      const proj = projectPointOnSegment(
        { latitude: lat, longitude: lng },
        path[i],
        path[i + 1],
      );

      let penalty = 0;
      if (floorId && !segmentOnFloor(path[i], path[i + 1], floorId)) {
        penalty += floorMismatchPenalty;
      }
      if (legId && path[i].legId && path[i + 1].legId) {
        if (path[i].legId !== legId && path[i + 1].legId !== legId) {
          penalty += wrongLegPenalty;
        }
      }
      if (currentLegIndex != null && legs?.length) {
        const segLeg = legs.find((l) => i >= l.startIndex && i <= l.endIndex);
        if (segLeg) {
          if (segLeg.index > currentLegIndex) penalty += futureLegPenalty;
          if (segLeg.index < currentLegIndex) penalty += previousLegPenalty;
        }
      }
      if (geo().isVerticalConnector(path[i], path[i + 1]) && floorId) {
        if (path[i].floorId !== floorId && path[i + 1].floorId !== floorId) {
          penalty += wrongConnectorPenalty;
        }
      }

      const adjustedDist = proj.distToSegment + penalty;

      if (!best || adjustedDist < best.offRouteMeters) {
        best = {
          latitude: proj.latitude,
          longitude: proj.longitude,
          segmentIndex: i,
          t: proj.t,
          distanceAlongPathMeters: cumulative + proj.t * segLen,
          offRouteMeters: adjustedDist,
          floorId: proj.floorId || path[i].floorId || path[i + 1].floorId,
          legId: proj.floorId === path[i + 1].floorId ? path[i + 1].legId : path[i].legId,
        };
      }
      cumulative += segLen;
    }

    return best;
  }

  function distanceAlongPathBetween(path, fromSnap, toPathIndex) {
    if (!path?.length || !fromSnap) return 0;

    const targetIndex = Math.min(Math.max(0, toPathIndex), path.length - 1);
    const fromSeg = fromSnap.segmentIndex;
    const fromT = fromSnap.t ?? 0;

    if (targetIndex <= fromSeg) return 0;

    let dist = (1 - fromT) * segmentLengthMeters(path[fromSeg], path[fromSeg + 1]);
    for (let i = fromSeg + 1; i < targetIndex; i++) {
      dist += segmentLengthMeters(path[i], path[i + 1]);
    }
    return Math.max(0, dist);
  }

  function pointAtDistanceAlongPath(path, startSnap, metersAhead) {
    if (!path?.length || !startSnap) return null;

    let remaining = Math.max(0, metersAhead);
    let seg = startSnap.segmentIndex;
    let t = startSnap.t ?? 0;

    const segLen = (i) => segmentLengthMeters(path[i], path[i + 1]);

    let onSeg = (1 - t) * segLen(seg);
    if (remaining <= onSeg) {
      const newT = t + remaining / Math.max(segLen(seg), 0.001);
      const interp = geo().interpolateCoordinate(path[seg], path[seg + 1], newT);
      return {
        latitude: interp.latitude,
        longitude: interp.longitude,
        floorId: interp.floorId,
        legId: interp.legId,
        segmentIndex: seg,
        t: newT,
        distanceAlongPathMeters: undefined,
      };
    }
    remaining -= onSeg;
    seg++;

    while (seg < path.length - 1) {
      const len = segLen(seg);
      if (remaining <= len) {
        const newT = remaining / Math.max(len, 0.001);
        const interp = geo().interpolateCoordinate(path[seg], path[seg + 1], newT);
        return {
          latitude: interp.latitude,
          longitude: interp.longitude,
          floorId: interp.floorId,
          segmentIndex: seg,
          t: newT,
        };
      }
      remaining -= len;
      seg++;
    }

    const last = path[path.length - 1];
    return {
      latitude: last.latitude,
      longitude: last.longitude,
      floorId: last.floorId,
      segmentIndex: path.length - 2,
      t: 1,
    };
  }

  function totalPathLengthMeters(path) {
    return geo().totalHorizontalPathMeters(path);
  }

  function distanceAlongPathToEnd(path, fromSnap) {
    if (!path?.length || !fromSnap) return null;
    return distanceAlongPathBetween(path, fromSnap, path.length - 1);
  }

  function snapAtDistanceAlongPath(path, metersAlong) {
    if (!path?.length) return null;
    const total = totalPathLengthMeters(path);
    const clamped = Math.max(0, Math.min(total, metersAlong));
    const start = {
      segmentIndex: 0,
      t: 0,
      latitude: path[0].latitude,
      longitude: path[0].longitude,
      floorId: path[0].floorId,
    };
    const pt = pointAtDistanceAlongPath(path, start, clamped);
    if (!pt) return null;
    return {
      latitude: pt.latitude,
      longitude: pt.longitude,
      floorId: pt.floorId,
      legId: pt.legId,
      segmentIndex: pt.segmentIndex ?? 0,
      t: pt.t ?? 0,
      distanceAlongPathMeters: clamped,
      offRouteMeters: 0,
    };
  }

  window.FplacesRouteGeometry = {
    haversineMeters,
    toLocalMeters,
    toGeographicLocalMeters,
    snapToRoute,
    snapAtDistanceAlongPath,
    totalPathLengthMeters,
    distanceAlongPathBetween,
    distanceAlongPathToEnd,
    pointAtDistanceAlongPath,
    segmentLengthMeters,
    normalizePath,
  };
})();
