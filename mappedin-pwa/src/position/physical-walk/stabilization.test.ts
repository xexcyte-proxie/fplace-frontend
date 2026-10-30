import { describe, expect, it } from 'vitest';
import { PhysicalWalkSession } from './session';
import { PhysicalWalkRecorder } from './recorder';
import { PositionInterpolation } from './render-interpolation';
const R = 6371000;
const physical = { latitude: 6.5, longitude: 3.4 };
const venue = { latitude: 43.46, longitude: -80.52 };
function fixture(e: number, n: number, timestamp: number, accuracy = 4) {
  return { latitude: physical.latitude + n / R * 180 / Math.PI,
    longitude: physical.longitude + e / (R * Math.cos(physical.latitude * Math.PI / 180)) * 180 / Math.PI,
    timestamp, accuracy, source: 'gps' as const };
}
function ready(accuracy = 4) {
  const session = new PhysicalWalkSession(true);
  session.start({ sessionId: 'stabilization', mapId: 'remote', floorId: 'g', anchor: venue }, 0);
  for (const t of [1000, 2000, 3000]) session.ingest(fixture(0, 0, t, accuracy), t);
  return session;
}
function venueMeters(s: PhysicalWalkSession) {
  const p = s.position!;
  return { east: (p.longitude - venue.longitude) * Math.PI / 180 * R * Math.cos(venue.latitude * Math.PI / 180),
    north: (p.latitude - venue.latitude) * Math.PI / 180 * R };
}
describe('physical walk stabilization', () => {
  it('holds stationary jitter even with improving accuracy and explains every decision', () => {
    const s = ready(20); const start = s.position;
    for (let i = 1; i <= 120; i++) {
      const t = 3000 + i * 1000;
      s.ingest(fixture(Math.sin(i * 2.1) * 0.35, Math.cos(i * 1.7) * 0.35, t, 4), t);
    }
    expect(s.position).toEqual(start);
    const held = JSON.parse(s.recorder.report()).events.filter((e: any) => e.type === 'fix.held');
    expect(held).toHaveLength(120);
    expect(held[0].data).toMatchObject({ reason: 'below-accuracy-deadband', accuracy: 4,
      threshold: 10, fixTimestamp: 4000, candidateEast: expect.any(Number), bearing: expect.any(Number), distanceFromAccepted: expect.any(Number) });
  });
  it('unlocks sustained walking instead of permanently applying poor origin accuracy', () => {
    const s = ready(20); let accepted = 0;
    for (let i = 1; i <= 20; i++) {
      const t = 3000 + i * 1000;
      if (s.ingest(fixture(0, i, t, 4), t)) accepted++;
    }
    expect(accepted).toBe(18);
    expect(venueMeters(s).north).toBeCloseTo(20, 5);
  });
  it('accepts repeated 0.25m slow walking but stops when observed position stops', () => {
    const s = ready(); let accepted = 0;
    for (let i = 1; i <= 24; i++) {
      const t = 3000 + i * 1000;
      if (s.ingest(fixture(0, i * 0.25, t), t)) accepted++;
    }
    expect(accepted).toBeGreaterThanOrEqual(7);
    const endpoint = s.position;
    for (let i = 1; i <= 20; i++) {
      const t = 27000 + i * 1000; s.ingest(fixture(0, 6, t), t);
    }
    expect(s.position).toEqual(endpoint);
  });
  it.each([[0, 5], [5, 0], [0, -5]])('maps physical E/N (%s,%s) at unit scale', (east, north) => {
    const s = ready();
    s.ingest(fixture(east, north, 6000), 6000); s.ingest(fixture(east, north, 7000), 7000);
    expect(venueMeters(s).east).toBeCloseTo(east, 5);
    expect(venueMeters(s).north).toBeCloseTo(north, 5);
  });
  it('retraces the same geographic path without changing anchor or scale', () => {
    const s = ready();
    for (const [n, t] of [[5, 6000], [5, 7000], [0, 10000], [0, 11000], [-5, 14000], [-5, 15000], [0, 18000], [0, 19000]]) s.ingest(fixture(0, n, t), t);
    expect(venueMeters(s).north).toBeCloseTo(0, 5);
    expect(venueMeters(s).east).toBeCloseTo(0, 5);
  });
  it('interrupts rendering at the current interpolated location and never extrapolates', () => {
    const render = new PositionInterpolation();
    render.setTarget({ latitude: 0, longitude: 0, floorId: 'g' }, 0);
    render.setTarget({ latitude: 0, longitude: 10, floorId: 'g' }, 1000);
    expect(render.sample(1400)!.longitude).toBeCloseTo(5, 8);
    render.setTarget({ latitude: 10, longitude: 5, floorId: 'g' }, 1400);
    expect(render.sample(1400)).toMatchObject({ latitude: 0, longitude: 5 });
    expect(render.sample(3000)).toMatchObject({ latitude: 10, longitude: 5 });
    expect(render.sample(30000)).toEqual(render.sample(3000));
    expect(render.complete(3000)).toBe(true);
    render.reset(); expect(render.sample(40000)).toBeNull();
  });
  it('retains GPS and lifecycle evidence despite high-frequency heading/render chatter', () => {
    const recorder = new PhysicalWalkRecorder(100);
    recorder.record('session.state', { state: 'active' }, 0);
    for (let i = 0; i < 20000; i++) {
      recorder.record('orientation.browser-event', { heading: i % 360, latitude: 6.5 }, i * 16);
      if (i % 450 === 0) recorder.record('fix.held', { reason: 'below-accuracy-deadband', fixTimestamp: i * 16 }, i * 16);
    }
    const report = JSON.parse(recorder.report());
    expect(report.suppressedRepetitiveEvents).toBeGreaterThan(15000);
    expect(report.eventCounts['orientation.browser-event']).toBe(20000);
    expect(report.events[0].type).toBe('session.state');
    expect(report.events.filter((e: any) => e.type === 'fix.held')).toHaveLength(45);
    expect(report.events).toHaveLength(100);
    expect(report.events.every((e: any) => !('latitude' in e.data))).toBe(true);
  });
});
