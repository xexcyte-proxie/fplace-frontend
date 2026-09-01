import { describe, expect, it } from 'vitest';

import {
  COMPASS_FRESH_MS,
  createCompassHeadingFilter,
  headingFromOrientationEvent,
  resolveNavigationConeHeading,
} from './cone-heading';

describe('resolveNavigationConeHeading', () => {
  it('uses a fresh compass heading over path bearing', () => {
    expect(
      resolveNavigationConeHeading({
        compassHeading: 40,
        compassAgeMs: 80,
        pathHeading: 91,
      }),
    ).toBe(40);
  });

  it('falls back to the path when the compass is stale', () => {
    expect(
      resolveNavigationConeHeading({
        compassHeading: 40,
        compassAgeMs: COMPASS_FRESH_MS + 50,
        pathHeading: 91,
      }),
    ).toBe(91);
  });

  it('uses path heading when no compass sample exists', () => {
    expect(
      resolveNavigationConeHeading({
        pathHeading: 180,
      }),
    ).toBe(180);
  });
});

describe('headingFromOrientationEvent', () => {
  it('prefers webkit compass heading', () => {
    expect(
      headingFromOrientationEvent({ webkitCompassHeading: 12, alpha: 90 }),
    ).toBe(12);
  });

  it('converts alpha to clockwise-from-north', () => {
    expect(headingFromOrientationEvent({ alpha: 90 })).toBe(270);
  });

  it('adds screen orientation when using alpha', () => {
    expect(
      headingFromOrientationEvent({ alpha: 90 }, { screenOrientationDeg: 90 }),
    ).toBe(0);
  });

  it('ignores an uncalibrated iOS magnetometer', () => {
    expect(
      headingFromOrientationEvent({
        webkitCompassHeading: 40,
        webkitCompassAccuracy: -1,
      }),
    ).toBeNull();
  });
});

describe('createCompassHeadingFilter', () => {
  it('ignores relative alpha while a webkit heading is live', () => {
    const filter = createCompassHeadingFilter({ settleSamples: 1 });
    expect(
      filter.ingest({ webkitCompassHeading: 90 }, 1000),
    ).toBe(90);
    expect(filter.ingest({ alpha: 10, absolute: false }, 1100)).toBeNull();
  });

  it('does not lock onto a jumping compass', () => {
    const filter = createCompassHeadingFilter({
      settleSamples: 4,
      maxSpreadDeg: 28,
    });
    expect(filter.ingestHeading(10)).toBeNull();
    expect(filter.ingestHeading(120)).toBeNull();
    expect(filter.ingestHeading(250)).toBeNull();
    expect(filter.ingestHeading(40)).toBeNull();
    expect(filter.isLocked()).toBe(false);
  });

  it('locks once headings agree, then follows smoothly', () => {
    const filter = createCompassHeadingFilter({
      settleSamples: 4,
      maxSpreadDeg: 28,
      smoothAlpha: 1,
    });
    expect(filter.ingestHeading(44)).toBeNull();
    expect(filter.ingestHeading(45)).toBeNull();
    expect(filter.ingestHeading(46)).toBeNull();
    expect(filter.ingestHeading(45)).toBe(45);
    expect(filter.isLocked()).toBe(true);
    expect(filter.ingestHeading(50)).toBe(50);
  });
});
