/**
 * Geometry helpers for route snapping and along-path distances.
 */
(function () {
  const R = 6371000;

  function haversineMeters(a, b) {
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
    const lat1 = (a.latitude * Math.PI) / 180;
    const lat2 = (b.latitude * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function toLocalMeters(ref, p) {
    const engine = window.FplacesAnchorEngine;
    if (engine?.isCalibrated) {
      const local = engine.convertToSLAMSpace(p);
      return { x: local.x, y: -local.z };
    }

    const cosLat = Math.cos((ref.latitude * Math.PI) / 180);
    const mLat = 111320;
    const mLng = 111320 * Math.max(Math.abs(cosLat), 0.01);
    return {
      x: (p.longitude - ref.longitude) * mLng,
      y: -(p.latitude - ref.latitude) * mLat,
    };
  }

  function projectPointOnSegment(point, a, b) {
    const ap = toLocalMeters(a, point);
    const ab = toLocalMeters(a, b);
    const abLen2 = ab.x * ab.x + ab.y * ab.y;
    let t = abLen2 > 0 ? (ap.x * ab.x + ap.y * ab.y) / abLen2 : 0;
    t = Math.max(0, Math.min(1, t));

    const proj = {
      x: ab.x * t,
      y: ab.y * t,
    };
    const dx = ap.x - proj.x;
    const dy = ap.y - proj.y;
    const distToSegment = Math.sqrt(dx * dx + dy * dy);

    return {
      t,
      distToSegment,
      segLen: Math.sqrt(abLen2),
      latitude: a.latitude + t * (b.latitude - a.latitude),
      longitude: a.longitude + t * (b.longitude - a.longitude),
    };
  }

  function segmentOnFloor(a, b, floorId) {
    if (!floorId) return true;
    const aFloor = a.floorId || null;
    const bFloor = b.floorId || null;
    if (!aFloor && !bFloor) return true;
    return aFloor === floorId || bFloor === floorId;
  }

  function snapToRoute(path, lat, lng, options) {
    const floorId = options?.floorId || null;
    const preferVenue = !!options?.preferVenue;
    const floorMismatchPenalty = preferVenue ? 40 : 80;
    const normalized = path
      .map((p) => {
        const latP = p.latitude ?? p.lat;
        const lngP = p.longitude ?? p.lng;
        if (latP == null || lngP == null) return null;
        return { latitude: Number(latP), longitude: Number(lngP), floorId: p.floorId };
      })
      .filter(Boolean);
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
      };
    }

    let best = null;
    let cumulative = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const segLen = haversineMeters(path[i], path[i + 1]);
      const proj = projectPointOnSegment(
        { latitude: lat, longitude: lng },
        path[i],
        path[i + 1],
      );

      let adjustedDist = proj.distToSegment;
      if (floorId && !segmentOnFloor(path[i], path[i + 1], floorId)) {
        adjustedDist += floorMismatchPenalty;
      }

      if (!best || adjustedDist < best.offRouteMeters) {
        best = {
          latitude: proj.latitude,
          longitude: proj.longitude,
          segmentIndex: i,
          t: proj.t,
          distanceAlongPathMeters: cumulative + proj.t * segLen,
          offRouteMeters: adjustedDist,
          floorId: path[i].floorId || path[i + 1].floorId || null,
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

    let dist = (1 - fromT) * haversineMeters(path[fromSeg], path[fromSeg + 1]);
    for (let i = fromSeg + 1; i < targetIndex; i++) {
      dist += haversineMeters(path[i], path[i + 1]);
    }
    return Math.max(0, dist);
  }

  function pointAtDistanceAlongPath(path, startSnap, metersAhead) {
    if (!path?.length || !startSnap) return null;

    let remaining = Math.max(0, metersAhead);
    let seg = startSnap.segmentIndex;
    let t = startSnap.t ?? 0;

    const segLen = (i) => haversineMeters(path[i], path[i + 1]);

    let onSeg = (1 - t) * segLen(seg);
    if (remaining <= onSeg) {
      const newT = t + remaining / segLen(seg);
      return {
        latitude: path[seg].latitude + newT * (path[seg + 1].latitude - path[seg].latitude),
        longitude: path[seg].longitude + newT * (path[seg + 1].longitude - path[seg].longitude),
        segmentIndex: seg,
        t: newT,
      };
    }
    remaining -= onSeg;
    seg++;

    while (seg < path.length - 1) {
      const len = segLen(seg);
      if (remaining <= len) {
        const newT = remaining / len;
        return {
          latitude: path[seg].latitude + newT * (path[seg + 1].latitude - path[seg].latitude),
          longitude: path[seg].longitude + newT * (path[seg + 1].longitude - path[seg].longitude),
          segmentIndex: seg,
          t: newT,
        };
      }
      remaining -= len;
      seg++;
    }

    return path[path.length - 1];
  }

  function totalPathLengthMeters(path) {
    if (!path?.length || path.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      total += haversineMeters(path[i], path[i + 1]);
    }
    return total;
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
    };
    const pt = pointAtDistanceAlongPath(path, start, clamped);
    if (!pt) return null;
    return {
      latitude: pt.latitude,
      longitude: pt.longitude,
      segmentIndex: pt.segmentIndex ?? 0,
      t: pt.t ?? 0,
      distanceAlongPathMeters: clamped,
      offRouteMeters: 0,
    };
  }

  window.FplacesRouteGeometry = {
    haversineMeters,
    toLocalMeters,
    snapToRoute,
    snapAtDistanceAlongPath,
    totalPathLengthMeters,
    distanceAlongPathBetween,
    distanceAlongPathToEnd,
    pointAtDistanceAlongPath,
  };
})();
