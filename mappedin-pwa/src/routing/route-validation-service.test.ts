import { describe, expect, it } from 'vitest';

import { computeGeometryHash, computeRouteChecksum } from './geometry-hash-service';
import { routeValidationService } from './route-validation-service';

describe('routeValidationService', () => {
  it('accepts a checksummed walk path with floor ids', () => {
    const path = [
      { latitude: 43.64, longitude: -79.38, floorId: 'floor-1' },
      { latitude: 43.641, longitude: -79.381, floorId: 'floor-1' },
    ];
    const generatedAt = 1_725_000_000_000;
    const geometryHash = computeGeometryHash({ pathCoordinates: path });
    const checksum = computeRouteChecksum({
      routeId: 'route-1',
      routeVersion: 1,
      geometryHash,
      generatedAt,
      pathLength: path.length,
    });

    const result = routeValidationService.validate({
      routeId: 'route-1',
      routeVersion: 1,
      generatedAt,
      geometryHash,
      checksum,
      pathCoordinates: path,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a path missing floor ids or a corrupted checksum', () => {
    const path = [
      { latitude: 43.64, longitude: -79.38, floorId: '' },
      { latitude: 43.641, longitude: -79.381, floorId: 'floor-1' },
    ];
    const missingFloor = routeValidationService.validate({
      routeId: 'route-2',
      routeVersion: 1,
      generatedAt: 1,
      pathCoordinates: path,
    });
    expect(missingFloor.valid).toBe(false);
    expect(missingFloor.errors.some((error) => /floorId/i.test(error))).toBe(
      true,
    );

    const checksumMismatch = routeValidationService.validate({
      routeId: 'route-3',
      routeVersion: 1,
      generatedAt: 1,
      geometryHash: 'abc',
      checksum: 'not-the-checksum',
      pathCoordinates: [
        { latitude: 43.64, longitude: -79.38, floorId: 'floor-1' },
        { latitude: 43.641, longitude: -79.381, floorId: 'floor-1' },
      ],
    });
    expect(checksumMismatch.valid).toBe(false);
    expect(checksumMismatch.errors.some((error) => /checksum/i.test(error))).toBe(
      true,
    );
  });
});
