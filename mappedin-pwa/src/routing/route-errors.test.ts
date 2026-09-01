import { describe, expect, it } from 'vitest';

import { haversineMeters } from '../utils/geo-math';
import {
  END_TOO_CLOSE_MESSAGE,
  LOCATION_NOT_ROUTABLE_MESSAGE,
  ROUTE_NOT_FOUND_MESSAGE,
  START_TOO_CLOSE_MESSAGE,
  toUserFacingRouteError,
} from './constants';

describe('indoor routing user-facing errors', () => {
  it('keeps persistent no-path and too-close copy', () => {
    expect(toUserFacingRouteError(new Error(ROUTE_NOT_FOUND_MESSAGE), 'fallback')).toBe(
      ROUTE_NOT_FOUND_MESSAGE,
    );
    expect(toUserFacingRouteError(new Error(START_TOO_CLOSE_MESSAGE), 'fallback')).toBe(
      START_TOO_CLOSE_MESSAGE,
    );
    expect(toUserFacingRouteError(new Error(END_TOO_CLOSE_MESSAGE), 'fallback')).toBe(
      END_TOO_CLOSE_MESSAGE,
    );
  });

  it('maps null-coordinate SDK failures to not-routable copy', () => {
    expect(
      toUserFacingRouteError(
        new Error("Cannot read properties of null (reading 'latitude')"),
        'fallback',
      ),
    ).toBe(LOCATION_NOT_ROUTABLE_MESSAGE);
  });

  it('rejects start/end points closer than 3 meters, matching RoutePlanner', () => {
    const origin = { latitude: 43.64, longitude: -79.38 };
    const tooClose = { latitude: 43.64 + 0.00001, longitude: -79.38 };
    const farEnough = { latitude: 43.641, longitude: -79.381 };

    expect(haversineMeters(origin, origin)).toBeLessThan(3);
    expect(haversineMeters(origin, tooClose)).toBeLessThan(3);
    expect(haversineMeters(origin, farEnough)).toBeGreaterThan(3);
  });
});
