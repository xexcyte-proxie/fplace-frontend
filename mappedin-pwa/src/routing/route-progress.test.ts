import { describe, expect, it } from 'vitest';

import { WALKING_SPEED_MPS } from './constants';
import {
  advanceContinuousAlongMeters,
  computeLiveRemainingMeters,
  estimateLiveWalkSeconds,
  hasArrivedAtDestination,
  resolveCanonicalRouteDistanceMeters,
  resolveLiveNavigationStartAlongMeters,
  shouldRevealDestinationMarker,
  LiveAlongPathStabilizer,
} from './route-progress';

describe('resolveLiveNavigationStartAlongMeters', () => {
  it('seeds Begin from the last projected snap so the blue-dot does not yank to 0', () => {
    expect(
      resolveLiveNavigationStartAlongMeters({
        lastProjectedAlongMeters: 4.2,
        routeTraveledMeters: 0,
      }),
    ).toBe(4.2);
  });

  it('falls back to stored traveled meters when no projected snap exists', () => {
    expect(
      resolveLiveNavigationStartAlongMeters({
        lastProjectedAlongMeters: null,
        routeTraveledMeters: 11,
      }),
    ).toBe(11);
  });

  it('falls back to the path origin when nothing is known yet', () => {
    expect(resolveLiveNavigationStartAlongMeters({})).toBe(0);
  });
});

describe('advanceContinuousAlongMeters', () => {
  it('crawls forward with continuous GPS snaps', () => {
    const advanced = advanceContinuousAlongMeters({
      previousAlongMeters: 5,
      rawAlongMeters: 7,
      dtSeconds: 1,
    });
    expect(advanced).toBeGreaterThan(5);
    expect(advanced).toBeLessThanOrEqual(7);
  });

  it('ignores L-corner teleports beyond the continuity window', () => {
    expect(
      advanceContinuousAlongMeters({
        previousAlongMeters: 5,
        rawAlongMeters: 40,
        dtSeconds: 1,
      }),
    ).toBe(5);
  });

  it('does not move backward', () => {
    expect(
      advanceContinuousAlongMeters({
        previousAlongMeters: 8,
        rawAlongMeters: 6,
        dtSeconds: 1,
      }),
    ).toBe(8);
  });
});

describe('resolveCanonicalRouteDistanceMeters', () => {
  it('prefers the geometric path length used by live remaining', () => {
    expect(resolveCanonicalRouteDistanceMeters(94.2, 120)).toBe(94.2);
  });

  it('falls back to Mappedin distance when the path is empty', () => {
    expect(resolveCanonicalRouteDistanceMeters(0, 80)).toBe(80);
    expect(resolveCanonicalRouteDistanceMeters(0, null)).toBeNull();
  });
});

describe('computeLiveRemainingMeters', () => {
  it('is unfinished path meters', () => {
    expect(
      computeLiveRemainingMeters({
        totalPathMeters: 100,
        alongPathMeters: 40,
      }),
    ).toBe(60);
  });

  it('adds off-route distance only beyond the 4 m jitter floor', () => {
    expect(
      computeLiveRemainingMeters({
        totalPathMeters: 100,
        alongPathMeters: 40,
        offRouteMeters: 3.5,
      }),
    ).toBe(60);
    expect(
      computeLiveRemainingMeters({
        totalPathMeters: 100,
        alongPathMeters: 40,
        offRouteMeters: 8,
      }),
    ).toBe(68);
  });

  it('ignores multi-km GPS misses so indoor ETA stays on the path', () => {
    expect(
      computeLiveRemainingMeters({
        totalPathMeters: 100,
        alongPathMeters: 40,
        offRouteMeters: 16251,
      }),
    ).toBe(60);
  });
});

describe('estimateLiveWalkSeconds', () => {
  it('uses the default indoor walking pace, not a live GPS speed', () => {
    expect(
      estimateLiveWalkSeconds({ remainingMeters: 140 }),
    ).toBeCloseTo(140 / WALKING_SPEED_MPS);
  });

  it('scales with the route duration when the original pace is known', () => {
    expect(
      estimateLiveWalkSeconds({
        remainingMeters: 50,
        totalPathMeters: 100,
        routeDurationSeconds: 80,
      }),
    ).toBe(40);
  });

  it('holds a positive ETA while remaining distance is frozen (user stopped)', () => {
    expect(
      estimateLiveWalkSeconds({ remainingMeters: 70 }),
    ).toBeCloseTo(70 / WALKING_SPEED_MPS);
  });
});

describe('hasArrivedAtDestination', () => {
  it('is true at the path end when still on route', () => {
    expect(
      hasArrivedAtDestination({
        totalPathMeters: 100,
        alongPathMeters: 99.5,
        offRouteMeters: 1,
      }),
    ).toBe(true);
  });

  it('is false at the start of a short path', () => {
    expect(
      hasArrivedAtDestination({
        totalPathMeters: 2,
        alongPathMeters: 0,
        offRouteMeters: 0,
      }),
    ).toBe(false);
  });

  it('is false while still short of the destination', () => {
    expect(
      hasArrivedAtDestination({
        totalPathMeters: 100,
        alongPathMeters: 80,
        offRouteMeters: 0,
      }),
    ).toBe(false);
  });

  it('is false at the end if the user is still off-route', () => {
    expect(
      hasArrivedAtDestination({
        totalPathMeters: 100,
        alongPathMeters: 100,
        offRouteMeters: 8,
      }),
    ).toBe(false);
  });

  it('does not arrive when GPS is kilometers off the Mappedin path', () => {
    expect(
      hasArrivedAtDestination({
        totalPathMeters: 100,
        alongPathMeters: 99.5,
        offRouteMeters: 16251,
      }),
    ).toBe(false);
  });
});

describe('shouldRevealDestinationMarker', () => {
  it('hides the pin while choosing an end point', () => {
    expect(
      shouldRevealDestinationMarker({
        navigating: false,
        remainingMeters: 80,
      }),
    ).toBe(false);
  });

  it('hides the pin at the start of a long walk', () => {
    expect(
      shouldRevealDestinationMarker({
        navigating: true,
        remainingMeters: 80,
        totalPathMeters: 80,
      }),
    ).toBe(false);
  });

  it('shows the pin when remaining walk is within 8 m', () => {
    expect(
      shouldRevealDestinationMarker({
        navigating: true,
        remainingMeters: 7,
        totalPathMeters: 80,
      }),
    ).toBe(true);
  });

  it('hides the pin until the remaining walk is very close', () => {
    expect(
      shouldRevealDestinationMarker({
        navigating: true,
        remainingMeters: 18,
        totalPathMeters: 80,
      }),
    ).toBe(false);
  });

  it('keeps the pin visible after it has been revealed', () => {
    expect(
      shouldRevealDestinationMarker({
        navigating: true,
        remainingMeters: 40,
        totalPathMeters: 80,
        alreadyRevealed: true,
      }),
    ).toBe(true);
  });

  it('shows immediately when the whole route is already short', () => {
    expect(
      shouldRevealDestinationMarker({
        navigating: true,
        remainingMeters: 6,
        totalPathMeters: 6,
      }),
    ).toBe(true);
  });
});

describe('LiveAlongPathStabilizer', () => {
  it('keeps a mid-route resume baseline instead of adopting the first GPS snap', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(47);
    expect(
      stabilizer.update({ nextAlongMeters: 92, nowMs: 1_000 }),
    ).toBe(47);
  });

  it('ignores a first indoor GPS snap to the destination after Begin', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(0);
    expect(
      stabilizer.update({ nextAlongMeters: 48, nowMs: 1_000 }),
    ).toBe(0);
  });

  it('still advances after a bogus first destination snap (does not poison lastRaw)', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(0);
    expect(
      stabilizer.update({ nextAlongMeters: 48, nowMs: 1_000 }),
    ).toBe(0);

    // Real fixes near the start must not look like reverse GPS jumps.
    expect(
      stabilizer.update({ nextAlongMeters: 1.5, nowMs: 2_000 }),
    ).toBe(0);
    const advanced = stabilizer.update({
      nextAlongMeters: 3.0,
      nowMs: 3_000,
    });
    expect(advanced).toBeGreaterThan(0);
    expect(advanced).toBeLessThanOrEqual(3.0);
  });

  it('recovers walking after a single corridor jump without poisoning the next fix', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(40);
    stabilizer.update({ nextAlongMeters: 40, nowMs: 1_000 });
    expect(
      stabilizer.update({ nextAlongMeters: 52, nowMs: 1_200 }),
    ).toBe(40);

    expect(
      stabilizer.update({ nextAlongMeters: 41.5, nowMs: 2_200 }),
    ).toBe(40);
    const advanced = stabilizer.update({
      nextAlongMeters: 43.0,
      nowMs: 3_200,
    });
    expect(advanced).toBeGreaterThan(40);
    expect(advanced).toBeLessThanOrEqual(43.0);
  });

  it('freezes along-path meters while standing still with snap jitter', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(40);
    stabilizer.update({ nextAlongMeters: 40, nowMs: 1_000 });

    expect(
      stabilizer.update({ nextAlongMeters: 40.4, nowMs: 2_000 }),
    ).toBe(40);
    expect(
      stabilizer.update({ nextAlongMeters: 39.7, nowMs: 3_000 }),
    ).toBe(40);
  });

  it('ignores a single indoor GPS jump along the corridor', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(40);
    stabilizer.update({ nextAlongMeters: 40, nowMs: 1_000 });

    expect(
      stabilizer.update({ nextAlongMeters: 52, nowMs: 1_200 }),
    ).toBe(40);
  });

  it('advances after consecutive walking samples', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(10);
    stabilizer.update({ nextAlongMeters: 10, nowMs: 1_000 });

    expect(
      stabilizer.update({ nextAlongMeters: 11.4, nowMs: 2_000 }),
    ).toBe(10);
    const advanced = stabilizer.update({
      nextAlongMeters: 12.8,
      nowMs: 3_000,
    });
    expect(advanced).toBeGreaterThan(10);
    expect(advanced).toBeLessThanOrEqual(12.8);
  });

  it('holds sub-step snap jitter while standing still', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(10);
    stabilizer.update({ nextAlongMeters: 10, nowMs: 1_000 });

    expect(
      stabilizer.update({ nextAlongMeters: 10.4, nowMs: 2_000 }),
    ).toBe(10);
    expect(
      stabilizer.update({ nextAlongMeters: 9.6, nowMs: 3_000 }),
    ).toBe(10);
  });

  it('still advances a real walker despite poor accuracy', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(0);
    stabilizer.update({ nextAlongMeters: 0, accuracyMeters: 30, nowMs: 1_000 });

    stabilizer.update({ nextAlongMeters: 9, accuracyMeters: 30, nowMs: 5_000 });
    const advanced = stabilizer.update({
      nextAlongMeters: 18,
      accuracyMeters: 30,
      nowMs: 9_000,
    });
    expect(advanced).toBeGreaterThan(0);
  });

  it('does not teleport along-path when an off-route snap lands on the far corridor', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(0);
    stabilizer.update({ nextAlongMeters: 0, nowMs: 1_000 });

    expect(
      stabilizer.update({
        nextAlongMeters: 22,
        offRouteMeters: 9,
        nowMs: 2_000,
      }),
    ).toBe(0);
    expect(
      stabilizer.update({
        nextAlongMeters: 21.4,
        offRouteMeters: 8,
        nowMs: 3_000,
      }),
    ).toBe(0);
  });

  it('does not adopt a destination snap while mid-route and off-path', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(40);
    stabilizer.update({ nextAlongMeters: 40, nowMs: 1_000 });

    expect(
      stabilizer.update({
        nextAlongMeters: 92,
        offRouteMeters: 9,
        nowMs: 2_000,
      }),
    ).toBe(40);
  });
});
