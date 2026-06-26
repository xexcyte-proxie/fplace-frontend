import type { RouteCoordinate } from '../../types';

const R = 6371000;

export function bearingDegrees(from: RouteCoordinate, to: RouteCoordinate): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function haversineMeters(a: RouteCoordinate, b: RouteCoordinate): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function interpolateAlongPath(
  path: RouteCoordinate[],
  segmentIndex: number,
  t: number,
): RouteCoordinate {
  const a = path[segmentIndex];
  const b = path[Math.min(segmentIndex + 1, path.length - 1)];
  return {
    latitude: a.latitude + t * (b.latitude - a.latitude),
    longitude: a.longitude + t * (b.longitude - a.longitude),
    floorId: a.floorId ?? b.floorId,
  };
}

export function pathTotalMeters(path: RouteCoordinate[]): number {
  if (path.length < 2) return 0;
  let total = 0;
  for (let index = 0; index < path.length - 1; index++) {
    total += haversineMeters(path[index], path[index + 1]);
  }
  return total;
}

export function metersAlongPath(
  path: RouteCoordinate[],
  segmentIndex: number,
  segmentT: number,
): number {
  if (path.length < 2) return 0;

  let meters = 0;
  for (let index = 0; index < segmentIndex; index++) {
    meters += haversineMeters(path[index], path[index + 1]);
  }

  if (segmentIndex < path.length - 1) {
    const clampedT = Math.min(1, Math.max(0, segmentT));
    meters +=
      haversineMeters(path[segmentIndex], path[segmentIndex + 1]) * clampedT;
  }

  return meters;
}
