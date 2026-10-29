import { describe, expect, it } from 'vitest';
import { isUsableDisplayFix, isUsableLiveFix, isUsableRouteSnap } from './live-fix-quality';
import type { FplacesPositionFrame } from '../types';
import { coordinateTransformationService } from '../../routing/coordinate-transformation-service';

const now = 100_000;
const fix: FplacesPositionFrame = { latitude: 6.6, longitude: 3.35, accuracy: 5, timestamp: now, source: 'gps' };

describe('live navigation fix quality', () => {
  it('accepts a fresh accurate fix', () => expect(isUsableLiveFix(fix, now)).toBe(true));
  it.each([
    { latitude: NaN }, { latitude: 91 }, { longitude: 181 },
    { accuracy: 180 }, { accuracy: -1 }, { accuracy: Infinity },
    { timestamp: now - 15_001 }, { timestamp: undefined }, { timestamp: now + 10_000 },
  ])('rejects unusable fix %j', (patch) => {
    expect(isUsableLiveFix({ ...fix, ...patch }, now)).toBe(false);
  });
  it('rejects a Canadian GPS fix projected onto a Lagos route', () => {
    const path = [
      { latitude: 6.6, longitude: 3.35, floorId: 'ground' },
      { latitude: 6.601, longitude: 3.35, floorId: 'ground' },
    ];
    const snap = coordinateTransformationService.snapToRoute(path, 43.463333, -80.523135)!;
    expect(isUsableRouteSnap({ ...fix, ...snap })).toBe(false);
    const nearby = coordinateTransformationService.snapToRoute(path, 6.6005, 3.35001)!;
    expect(isUsableRouteSnap({ ...fix, ...nearby })).toBe(true);
  });
  it.each([undefined, NaN, Infinity, -1, 31, 9009000])('rejects unsafe snap distance %s', (offRouteMeters) => {
    expect(isUsableRouteSnap({ ...fix, offRouteMeters })).toBe(false);
  });
});


describe('approximate display quality', () => {
  it('accepts fresh 35m and 50m readings for display only', () => {
    for (const accuracy of [35, 50]) {
      expect(isUsableDisplayFix({ ...fix, accuracy }, now)).toBe(true);
      expect(isUsableLiveFix({ ...fix, accuracy }, now)).toBe(false);
    }
  });
  it.each([{ accuracy: 51 }, { accuracy: NaN }, { timestamp: now - 15_001 }, { timestamp: undefined }, { timestamp: now + 1_001 }, { latitude: 91 }])('rejects %j even for approximate display', patch => {
    expect(isUsableDisplayFix({ ...fix, ...patch }, now)).toBe(false);
  });
});
