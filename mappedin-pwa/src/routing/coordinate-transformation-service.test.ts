import { describe, expect, it } from 'vitest';

import { coordinateTransformationService } from './coordinate-transformation-service';
import type { RouteCoordinate } from '../types';

/** ~12 m north then ~12 m east: the venue L that made the blue dot teleport. */
function lShapedPath(): RouteCoordinate[] {
  const startLat = 6.5244;
  const startLng = 3.3792;
  const north = 12 / 111_320;
  const east = 12 / (111_320 * Math.cos((startLat * Math.PI) / 180));
  return [
    { latitude: startLat, longitude: startLng, floorId: 'level-1' },
    { latitude: startLat + north, longitude: startLng, floorId: 'level-1' },
    { latitude: startLat + north, longitude: startLng + east, floorId: 'level-1' },
  ];
}

function insideCornerCloserToRightLeg(path: RouteCoordinate[]): {
  latitude: number;
  longitude: number;
} {
  const start = path[0];
  const corner = path[1];
  const south = 2 / 111_320;
  const east = 5 / (111_320 * Math.cos((start.latitude * Math.PI) / 180));
  return {
    latitude: corner.latitude - south,
    longitude: start.longitude + east,
  };
}

describe('snapToRoute along-path continuity', () => {
  it('nearest-point alone flips to the right leg inside an L', () => {
    const path = lShapedPath();
    const fix = insideCornerCloserToRightLeg(path);
    const snapped = coordinateTransformationService.snapToRoute(
      path,
      fix.latitude,
      fix.longitude,
    );
    expect(snapped).not.toBeNull();
    expect(snapped!.distanceAlongPathMeters).toBeGreaterThan(12);
  });

  it('stays on the start corridor when the odometer is still at the origin', () => {
    const path = lShapedPath();
    const fix = insideCornerCloserToRightLeg(path);
    const snapped = coordinateTransformationService.snapToRoute(
      path,
      fix.latitude,
      fix.longitude,
      { previousAlongMeters: 0, accuracyMeters: 30 },
    );
    expect(snapped).not.toBeNull();
    expect(snapped!.distanceAlongPathMeters).toBeLessThan(12);
  });

  it('snapAtDistanceAlongPath keeps the avatar on the stabilized odometer', () => {
    const path = lShapedPath();
    const start = coordinateTransformationService.snapAtDistanceAlongPath(path, 0);
    const nearEnd = coordinateTransformationService.snapAtDistanceAlongPath(path, 22);
    expect(start?.latitude).toBeCloseTo(path[0].latitude, 6);
    expect(start?.longitude).toBeCloseTo(path[0].longitude, 6);
    expect(nearEnd?.longitude).toBeGreaterThan(path[0].longitude);
  });
});
