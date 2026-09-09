import { describe, expect, it } from 'vitest';

import {
  createStationaryPositionFilter,
  significantMoveThresholdMeters,
} from './stationary-position-filter';

// ~1 degree latitude ≈ 111,320 m, so 0.0001° ≈ 11.1 m.
const BASE = { latitude: 6.5244, longitude: 3.3792 };

function offsetMeters(meters: number) {
  return { latitude: BASE.latitude + meters / 111_320, longitude: BASE.longitude };
}

describe('significantMoveThresholdMeters', () => {
  it('scales with accuracy', () => {
    expect(significantMoveThresholdMeters(40)).toBe(20);
    expect(significantMoveThresholdMeters(60)).toBe(30);
  });

  it('never drops below the minimum move floor', () => {
    expect(significantMoveThresholdMeters(4)).toBe(5);
    expect(significantMoveThresholdMeters(0)).toBe(5);
  });
});

describe('createStationaryPositionFilter', () => {
  it('accepts the first fix as the anchor', () => {
    const filter = createStationaryPositionFilter();
    const result = filter.process({ ...BASE, accuracy: 40 });
    expect(result.held).toBe(false);
    expect(result.fix.latitude).toBe(BASE.latitude);
  });

  it('holds the anchor while jitter stays inside the accuracy threshold', () => {
    const filter = createStationaryPositionFilter();
    filter.process({ ...BASE, accuracy: 40 });

    // 12 m jump with 40 m accuracy (threshold 20 m) → GPS noise, stay put.
    const result = filter.process({ ...offsetMeters(12), accuracy: 40 });
    expect(result.held).toBe(true);
    expect(result.fix.latitude).toBe(BASE.latitude);
    expect(result.fix.longitude).toBe(BASE.longitude);
  });

  it('holds the anchor accuracy so the ring does not pulse', () => {
    const filter = createStationaryPositionFilter();
    filter.process({ ...BASE, accuracy: 40 });
    const result = filter.process({ ...offsetMeters(8), accuracy: 44 });
    expect(result.held).toBe(true);
    expect(result.fix.accuracy).toBe(40);
  });

  it('moves once displacement exceeds the accuracy-scaled threshold', () => {
    const filter = createStationaryPositionFilter();
    filter.process({ ...BASE, accuracy: 40 });

    // 25 m > 20 m threshold → real movement.
    const moved = offsetMeters(25);
    const result = filter.process({ ...moved, accuracy: 40 });
    expect(result.held).toBe(false);
    expect(result.fix.latitude).toBe(moved.latitude);
  });

  it('tracks continuous walking by measuring from the anchor', () => {
    const filter = createStationaryPositionFilter();
    filter.process({ ...BASE, accuracy: 30 });

    // Each step is small, but distance accumulates from the anchor.
    expect(filter.process({ ...offsetMeters(6), accuracy: 30 }).held).toBe(true);
    expect(filter.process({ ...offsetMeters(12), accuracy: 30 }).held).toBe(true);
    const past = filter.process({ ...offsetMeters(16), accuracy: 30 });
    expect(past.held).toBe(false); // 16 m > 15 m threshold
  });

  it('re-anchors when a markedly more accurate fix arrives', () => {
    const filter = createStationaryPositionFilter();
    filter.process({ ...BASE, accuracy: 60 });

    // Only 4 m away (below the 6 m threshold), but accuracy 60 → 12 is a
    // much better estimate, so the anchor moves to it.
    const better = filter.process({ ...offsetMeters(4), accuracy: 12 });
    expect(better.held).toBe(false);
  });

  it('does not re-anchor for marginal accuracy changes', () => {
    const filter = createStationaryPositionFilter();
    filter.process({ ...BASE, accuracy: 40 });
    const result = filter.process({ ...offsetMeters(10), accuracy: 35 });
    expect(result.held).toBe(true);
  });

  it('treats missing accuracy as the default uncertainty', () => {
    const filter = createStationaryPositionFilter();
    filter.process(BASE);
    // Default 30 m accuracy → 15 m threshold; a 10 m jump is noise.
    expect(filter.process(offsetMeters(10)).held).toBe(true);
    expect(filter.process(offsetMeters(20)).held).toBe(false);
  });

  it('holds the anchor when a malformed fix arrives', () => {
    const filter = createStationaryPositionFilter();
    filter.process({ ...BASE, accuracy: 20 });
    const result = filter.process({ latitude: Number.NaN, longitude: 3.3, accuracy: 5 });
    expect(result.held).toBe(true);
    expect(result.fix.latitude).toBe(BASE.latitude);
  });

  it('starts fresh after reset', () => {
    const filter = createStationaryPositionFilter();
    filter.process({ ...BASE, accuracy: 40 });
    filter.reset();
    const next = filter.process({ ...offsetMeters(8), accuracy: 40 });
    expect(next.held).toBe(false);
    expect(next.fix.latitude).toBeCloseTo(offsetMeters(8).latitude, 10);
  });
});
