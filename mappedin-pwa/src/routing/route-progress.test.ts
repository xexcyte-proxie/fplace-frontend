import { describe, expect, it } from 'vitest';

import { WALKING_SPEED_MPS } from './constants';
import {
  computeLiveRemainingMeters,
  estimateLiveWalkSeconds,
  hasArrivedAtDestination,
  shouldRevealDestinationMarker,
  LiveAlongPathStabilizer,
} from './route-progress';

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

  it('shows the pin when remaining walk is within 20 m', () => {
    expect(
      shouldRevealDestinationMarker({
        navigating: true,
        remainingMeters: 18,
        totalPathMeters: 80,
      }),
    ).toBe(true);
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
        remainingMeters: 12,
        totalPathMeters: 12,
      }),
    ).toBe(true);
  });
});

describe('LiveAlongPathStabilizer', () => {
  it('accepts the first fix so a mid-route start is not stuck at 0', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(0);
    expect(
      stabilizer.update({ nextAlongMeters: 47, nowMs: 1_000 }),
    ).toBe(47);
  });

  it('freezes along-path meters while standing still with snap jitter', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(0);
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
    stabilizer.reset(0);
    stabilizer.update({ nextAlongMeters: 40, nowMs: 1_000 });

    expect(
      stabilizer.update({ nextAlongMeters: 52, nowMs: 1_200 }),
    ).toBe(40);
  });

  it('advances after consecutive walking samples', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(0);
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

  it('accepts an off-route snap immediately so remaining can include the detour', () => {
    const stabilizer = new LiveAlongPathStabilizer();
    stabilizer.reset(0);
    stabilizer.update({ nextAlongMeters: 40, nowMs: 1_000 });

    expect(
      stabilizer.update({
        nextAlongMeters: 38,
        offRouteMeters: 9,
        nowMs: 2_000,
      }),
    ).toBe(38);
  });
});
