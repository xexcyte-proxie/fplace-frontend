import { describe, expect, it } from 'vitest';

import {
  alongPathContinuityPenalty,
  DEFAULT_MAX_ALONG_DELTA_METERS,
  scoreSnapWithAlongContinuity,
} from './snap-along-continuity';

describe('alongPathContinuityPenalty', () => {
  it('is zero without a previous along-path anchor', () => {
    expect(alongPathContinuityPenalty(22)).toBe(0);
    expect(alongPathContinuityPenalty(22, null)).toBe(0);
  });

  it('is zero while the candidate stays on the current corridor', () => {
    expect(alongPathContinuityPenalty(8, 0)).toBe(0);
    expect(alongPathContinuityPenalty(11, 0)).toBe(0);
  });

  it('penalizes an L-path jump from the start corridor to the destination', () => {
    expect(alongPathContinuityPenalty(22, 0)).toBeGreaterThan(10);
  });
});

describe('scoreSnapWithAlongContinuity', () => {
  it('lets the nearer corridor win when both are equally close geometrically', () => {
    const left = scoreSnapWithAlongContinuity({
      distToSegment: 4,
      alongPathMeters: 3,
      previousAlongMeters: 0,
    });
    const right = scoreSnapWithAlongContinuity({
      distToSegment: 2,
      alongPathMeters: 22,
      previousAlongMeters: 0,
    });
    expect(left).toBeLessThan(right);
  });

  it('still allows a snap that is truly next to the destination', () => {
    const dest = scoreSnapWithAlongContinuity({
      distToSegment: 1,
      alongPathMeters: 23,
      previousAlongMeters: 22,
    });
    const start = scoreSnapWithAlongContinuity({
      distToSegment: 18,
      alongPathMeters: 1,
      previousAlongMeters: 22,
    });
    expect(dest).toBeLessThan(start);
  });
});

describe('DEFAULT_MAX_ALONG_DELTA_METERS', () => {
  it('stays inside a walking step on a short venue L-path', () => {
    expect(DEFAULT_MAX_ALONG_DELTA_METERS).toBe(12);
  });
});
