import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const liveGuidance = require('../../../ar-nav/js/live-guidance.js') as {
  ALIGN_THRESHOLD_DEG: number;
  resolveLiveGuidance: (input: {
    arrived?: boolean;
    destinationName?: string | null;
    alignmentDeltaDeg?: number | null;
    distanceToTargetMeters?: number | null;
    remainingMeters?: number | null;
  }) => {
    primary: { label: string; symbol: string };
    then: null;
    distanceLabel: string;
    distanceMeters: number | null;
    alignmentDelta: number | null;
  };
};

describe('resolveLiveGuidance', () => {
  it('stays on head straight when aligned even if a turn is nearby', () => {
    const cue = liveGuidance.resolveLiveGuidance({
      alignmentDeltaDeg: 4,
      distanceToTargetMeters: 4,
      remainingMeters: 40,
    });
    expect(cue.primary.label).toBe('Head straight');
    expect(cue.primary.symbol).toBe('straight');
    expect(cue.then).toBeNull();
  });

  it('stays on head straight when heading is unknown', () => {
    const cue = liveGuidance.resolveLiveGuidance({
      alignmentDeltaDeg: null,
      distanceToTargetMeters: 25,
      remainingMeters: 80,
    });
    expect(cue.primary.label).toBe('Head straight');
  });

  it('corrects with turn right when facing left of the path', () => {
    const cue = liveGuidance.resolveLiveGuidance({
      alignmentDeltaDeg: 42,
      distanceToTargetMeters: 20,
      remainingMeters: 60,
    });
    expect(cue.primary.label).toBe('Turn right');
    expect(cue.primary.symbol).toBe('turn_right');
  });

  it('corrects with turn left when facing right of the path', () => {
    const cue = liveGuidance.resolveLiveGuidance({
      alignmentDeltaDeg: -42,
      distanceToTargetMeters: 20,
      remainingMeters: 60,
    });
    expect(cue.primary.label).toBe('Turn left');
    expect(cue.primary.symbol).toBe('turn_left');
  });

  it('asks to turn around when facing the opposite way', () => {
    const cue = liveGuidance.resolveLiveGuidance({
      alignmentDeltaDeg: 160,
      distanceToTargetMeters: 12,
      remainingMeters: 40,
    });
    expect(cue.primary.label).toBe('Turn around');
  });

  it('does not announce route turns just because distance is small', () => {
    const cue = liveGuidance.resolveLiveGuidance({
      alignmentDeltaDeg: 2,
      distanceToTargetMeters: 1,
      remainingMeters: 30,
    });
    expect(cue.primary.label).toBe('Head straight');
    expect(cue.then).toBeNull();
  });

  it('shows arrive when remaining distance is tiny', () => {
    const cue = liveGuidance.resolveLiveGuidance({
      alignmentDeltaDeg: 0,
      distanceToTargetMeters: 2,
      remainingMeters: 2,
    });
    expect(cue.primary.label).toBe('Arrive');
  });

  it('shows arrived when navigation completed', () => {
    const cue = liveGuidance.resolveLiveGuidance({
      arrived: true,
      destinationName: 'Gate A',
    });
    expect(cue.primary.label).toBe('Arrived at Gate A');
    expect(cue.primary.symbol).toBe('flag');
  });
});
