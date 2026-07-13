import type { RouteCoordinate } from '../../types';
import {
  segmentHorizontalMeters,
} from '../../utils/geo-math';

export { bearingDegrees, haversineMeters } from '../../utils/geo-math';

export function interpolateAlongPath(
  path: RouteCoordinate[],
  segmentIndex: number,
  t: number,
): RouteCoordinate {
  const a = path[segmentIndex];
  const b = path[Math.min(segmentIndex + 1, path.length - 1)];
  const floorId =
    t < 0.5 ? a.floorId || b.floorId : b.floorId || a.floorId;
  return {
    latitude: a.latitude + t * (b.latitude - a.latitude),
    longitude: a.longitude + t * (b.longitude - a.longitude),
    floorId: floorId || 'unknown',
  };
}

export function pathTotalMeters(path: RouteCoordinate[]): number {
  if (path.length < 2) return 0;
  let total = 0;
  for (let index = 0; index < path.length - 1; index++) {
    total += segmentHorizontalMeters(path[index], path[index + 1]);
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
    meters += segmentHorizontalMeters(path[index], path[index + 1]);
  }

  if (segmentIndex < path.length - 1) {
    const clampedT = Math.min(1, Math.max(0, segmentT));
    meters +=
      segmentHorizontalMeters(path[segmentIndex], path[segmentIndex + 1]) * clampedT;
  }

  return meters;
}
