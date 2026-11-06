import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const api = createRequire(import.meta.url)('../../../ar-nav/js/live-guidance.js');
const base = { alignmentDeltaDeg: 0, distanceToTargetMeters: 8, remainingMeters: 40 };
describe('route and phone guidance', () => {
  it('never treats unavailable or invalid heading as straight', () => {
    for (const alignmentDeltaDeg of [null, undefined, NaN, Infinity]) {
      expect(api.resolveLiveGuidance({ ...base, alignmentDeltaDeg }).primary.label).toBe('Face the route');
    }
  });
  it.each([
    [0, 'Head straight'], [10, 'Head straight'], [45, 'Turn right'],
    [-45, 'Turn left'], [160, 'Turn around'], [-160, 'Turn around'],
  ])('uses facing delta %s for the main label', (alignmentDeltaDeg, label) => {
    const cue = api.resolveLiveGuidance({ ...base, alignmentDeltaDeg,
      nextManeuver: { label: 'Turn right', symbol: 'turn_right' } });
    expect(cue.primary.label).toBe(label);
  });
  it('does not infer arrival from small remaining distance', () => {
    expect(api.resolveLiveGuidance({ ...base, remainingMeters: 1 }).primary.label).toBe('Head straight');
    expect(api.resolveLiveGuidance({ ...base, arrived: true, destinationName: 'Gate A' }).primary.label).toBe('Arrived at Gate A');
  });
  it('prioritizes unreliable position and off-route recovery', () => {
    expect(api.resolveLiveGuidance({ ...base, positionReliable: false }).primary.label).toBe('Position uncertain');
    expect(api.resolveLiveGuidance({ ...base, offRoute: true }).primary.label).toBe('Return to the route');
  });
  it('requires stable evidence and uses hysteresis for alignment', () => {
    const tracker = api.createGuidanceTracker();
    const cue = (delta: number | null, now: number) => tracker.update({ ...base, alignmentDeltaDeg: delta }, now);
    expect(cue(24, 0).alignmentPrompt).toBeNull();
    expect(cue(24, 349).alignmentPrompt).toBeNull();
    expect(cue(24, 350).primary.label).toBe('Turn right');
    for (let t = 400; t < 1000; t += 50) expect(cue(t % 100 ? 17 : 19, t).alignmentPrompt).toContain('right');
    expect(cue(10, 1000).alignmentPrompt).toContain('right');
    expect(cue(10, 1350).primary.label).toBe('Head straight');
    expect(cue(null, 1400).primary.label).toBe('Face the route');
  });
  it('clears pending alignment on tracking loss', () => {
    const tracker = api.createGuidanceTracker();
    tracker.update({ ...base, alignmentDeltaDeg: -50 }, 0);
    tracker.update({ ...base, positionReliable: false }, 500);
    expect(tracker.update({ ...base, alignmentDeltaDeg: -50 }, 600).alignmentPrompt).toBeNull();
  });
});

it('stabilizes left, right, and around changes on the main card', () => {
  const tracker = api.createGuidanceTracker();
  const cue = (delta: number, now: number) => tracker.update({ ...base, alignmentDeltaDeg: delta }, now);
  cue(-50, 0); expect(cue(-50, 350).primary.label).toBe('Turn left');
  expect(cue(50, 400).primary.label).toBe('Turn left');
  expect(cue(50, 750).primary.label).toBe('Turn right');
  cue(160, 800); expect(cue(160, 1150).primary.label).toBe('Turn around');
  expect(cue(130, 1200).primary.label).toBe('Turn around');
  cue(0, 1250); expect(cue(0, 1600).primary.label).toBe('Head straight');
});

it.each([0, 0.1, 0.49, 0.99, -1])('does not display a zero-metre instruction at target distance %s', (distanceToTargetMeters) => {
  for (const cue of [api.resolveLiveGuidance({ ...base, distanceToTargetMeters }),
    api.createGuidanceTracker().update({ ...base, distanceToTargetMeters }, 0)]) {
    expect(cue.primary.label).toBe('Head straight');
    expect(cue.distanceLabel).toBe('Follow the path');
  }
});
it('retains useful distance and confirmed arrival messages', () => {
  expect(api.resolveLiveGuidance(base).distanceLabel).toBe('Continue for 8 m');
  expect(api.resolveLiveGuidance({ ...base, distanceToTargetMeters: null }).distanceLabel).toBe('Follow the route');
  expect(api.createGuidanceTracker().update({ ...base, arrived: true, distanceToTargetMeters: 0 }, 0).distanceLabel)
    .toBe('You have reached your destination');
});
