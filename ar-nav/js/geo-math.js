/**
 * Authoritative geodetic math for fplaces AR navigation.
 *
 * Coordinate model (single source of truth):
 *   Equirectangular projection on a sphere with R = 6371000 m.
 *   Longitude scale uses cos(mid-latitude) between reference and target.
 *
 *   ARCore Geospatial frames (Google AR Directional Alignment):
 *     EUS - East-Up-South:  X+=east, Y+=up (away from Earth center), Z+=south
 *     EUN - East-Up-North:  X+=east, Y+=up, Z+=north
 *
 *   Three.js / SLAM floor plane uses EUS with Y as vertical:
 *     local X = east (+lng), local Y = up, local Z = south (+lat inverted).
 *
 * Calibration only moves the reference origin; it never changes this conversion.
 * Haversine is used exclusively for along-path distances on the WGS84 sphere.
 */
(function () {
  const EARTH_RADIUS_M = 6371000;
  const MIN_COS_LAT = 0.01;

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function toDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  function normalizeDegrees(deg) {
    return ((deg % 360) + 360) % 360;
  }

  /**
   * Great-circle distance between two WGS84 points (meters).
   */
  function haversineMeters(a, b) {
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  }

  /**
   * Initial bearing from `from` to `to` (degrees, 0 = north, clockwise).
   */
  function bearingDegrees(from, to) {
    const lat1 = toRad(from.latitude);
    const lat2 = toRad(to.latitude);
    const dLng = toRad(to.longitude - from.longitude);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return normalizeDegrees(toDeg(Math.atan2(y, x)));
  }

  /**
   * Absolute pose in EUS meters relative to ref (ARCore East-Up-South).
   * x=east, y=up, z=south.
   */
  function geoToEUSMeters(ref, p) {
    const local = geoToLocalMeters(ref, p);
    return {
      x: local.x,
      y: Number(p?.altitude ?? p?.alt ?? 0) - Number(ref?.altitude ?? ref?.alt ?? 0),
      z: local.z,
    };
  }

  /**
   * Absolute pose in EUN meters relative to ref (Unity geospatial variant).
   * x=east, y=up, z=north.
   */
  function geoToEUNMeters(ref, p) {
    const eus = geoToEUSMeters(ref, p);
    return { x: eus.x, y: eus.y, z: -eus.z };
  }

  /**
   * Direction vector P_target − P_user in EUS meters (geospatial delta).
   */
  function geoDeltaToEUSMeters(ref, from, to) {
    const a = geoToEUSMeters(ref, from);
    const b = geoToEUSMeters(ref, to);
    return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  }

  /**
   * Direction vector P_target − P_user in EUN meters.
   */
  function geoDeltaToEUNMeters(ref, from, to) {
    const delta = geoDeltaToEUSMeters(ref, from, to);
    return { x: delta.x, y: delta.y, z: -delta.z };
  }

  /**
   * Equirectangular local offset from ref → p in meters (SLAM/Three.js EUS floor axes).
   * x = east, z = south (negative of north).
   */
  function geoToLocalMeters(ref, p) {
    if (!ref || !p) return { x: 0, z: 0 };

    const lat0 = Number(ref.latitude);
    const lng0 = Number(ref.longitude);
    const lat1 = Number(p.latitude);
    const lng1 = Number(p.longitude);

    const dLatRad = toRad(lat1 - lat0);
    const dLngRad = toRad(lng1 - lng0);
    const cosMid = Math.cos((toRad(lat0) + toRad(lat1)) / 2);

    return {
      x: dLngRad * EARTH_RADIUS_M * Math.max(Math.abs(cosMid), MIN_COS_LAT),
      z: -(dLatRad * EARTH_RADIUS_M),
    };
  }

  /**
   * 2D map-plane projection: x = east, y = north (inverted from z for legacy 2D callers).
   */
  function geoToLocal2D(ref, p) {
    const local = geoToLocalMeters(ref, p);
    return { x: local.x, y: -local.z };
  }

  function isVerticalConnector(a, b) {
    if (!a || !b) return false;
    return !!(a.floorId && b.floorId && a.floorId !== b.floorId);
  }

  /**
   * Horizontal segment length - zero for inter-floor connectors (no fake elevation).
   */
  function segmentHorizontalMeters(a, b) {
    if (isVerticalConnector(a, b)) return 0;
    return haversineMeters(a, b);
  }

  function totalHorizontalPathMeters(path) {
    if (!path?.length || path.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      total += segmentHorizontalMeters(path[i], path[i + 1]);
    }
    return total;
  }

  function floorIdAtT(a, b, t) {
    if (!a || !b) return a?.floorId || b?.floorId || '';
    if (t <= 0) return a.floorId || b.floorId || '';
    if (t >= 1) return b.floorId || a.floorId || '';
    if (a.floorId && b.floorId && a.floorId !== b.floorId) {
      return t < 0.5 ? a.floorId : b.floorId;
    }
    return a.floorId || b.floorId || '';
  }

  function interpolateCoordinate(a, b, t) {
    const clamped = Math.max(0, Math.min(1, t));
    return {
      latitude: a.latitude + clamped * (b.latitude - a.latitude),
      longitude: a.longitude + clamped * (b.longitude - a.longitude),
      floorId: floorIdAtT(a, b, clamped),
      legId: clamped < 0.5 ? a.legId || b.legId : b.legId || a.legId,
    };
  }

  /**
   * Deterministic geometry hash - delegates to FplacesRouteServices when available.
   */
  function pathGeometryHash(path, extras) {
    if (window.FplacesRouteServices?.computeGeometryHash) {
      return window.FplacesRouteServices.computeGeometryHash({
        pathCoordinates: path,
        ...(extras || {}),
      });
    }
    if (!path?.length) return '0';
    let hash = path.length;
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      hash = (hash * 31 + Math.round(p.latitude * 1e6)) | 0;
      hash = (hash * 31 + Math.round(p.longitude * 1e6)) | 0;
      if (p.floorId) {
        for (let j = 0; j < p.floorId.length; j++) {
          hash = (hash * 31 + p.floorId.charCodeAt(j)) | 0;
        }
      }
    }
    return (hash >>> 0).toString(36);
  }

  window.FplacesGeoMath = {
    EARTH_RADIUS_M,
    haversineMeters,
    bearingDegrees,
    geoToEUSMeters,
    geoToEUNMeters,
    geoDeltaToEUSMeters,
    geoDeltaToEUNMeters,
    geoToLocalMeters,
    geoToLocal2D,
    segmentHorizontalMeters,
    totalHorizontalPathMeters,
    isVerticalConnector,
    floorIdAtT,
    interpolateCoordinate,
    pathGeometryHash,
    normalizeDegrees,
  };
})();
