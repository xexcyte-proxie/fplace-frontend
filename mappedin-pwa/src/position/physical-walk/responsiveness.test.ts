import { describe, expect, it } from 'vitest';
import { PhysicalWalkSession } from './session';
import { PhysicalWalkRecorder } from './recorder';
import { PHYSICAL_WALK_TUNING } from './tuning';
import { offset, displacement } from './transform';
import { RouteGuidedWalk } from './route-guided';
import { PositionInterpolation } from './render-interpolation';
const physical = { latitude: 6.5, longitude: 3.4 };
const anchor = { latitude: 43.46, longitude: -80.52, floorId: 'g' };
function setup() {
  const session = new PhysicalWalkSession(true);
  session.start({ sessionId: 'responsive', mapId: 'remote', floorId: 'g', anchor }, 0);
  const send = (e: number, n: number, time: number, accuracy = 4) => session.ingest({ ...offset(physical, { east: e, north: n }), accuracy, timestamp: time, source: 'gps' }, time);
  for (const t of [1000, 2000, 3000]) send(0, 0, t);
  return { session, send };
}
describe('demo movement responsiveness', () => {
  it('publishes small consistent 0.4m steps within four seconds and then every second', () => {
    const { session, send } = setup(); const times: number[] = [];
    for (let i = 1; i <= 20; i++) if (send(i * 0.4, 0, 3000 + i * 1000)) times.push(i);
    expect(times[0]).toBeLessThanOrEqual(4);
    expect(times.slice(-8)).toEqual([13, 14, 15, 16, 17, 18, 19, 20]);
    expect(session.position!.east).toBeCloseTo(8, 5);
  });
  it('establishes slow 0.25m/s walking from the full evidence window', () => {
    const { session, send } = setup(); const times: number[] = [];
    for (let i = 1; i <= 24; i++) if (send(0, i * 0.25, 3000 + i * 1000)) times.push(i);
    expect(times[0]).toBeLessThanOrEqual(6); expect(times.length).toBeGreaterThanOrEqual(10);
    expect(session.position!.north).toBeCloseTo(6, 5);
    const events = JSON.parse(session.recorder.report()).events;
    expect(events.some((e: any) => e.type === 'movement.accepted' && e.data.consistentEvidence === true)).toBe(true);
  });
  it('does not accumulate repeated bounded stationary jitter into distance', () => {
    const { session, send } = setup(); const origin = session.position;
    for (let i = 1; i <= 600; i++) send(Math.sin(i * 1.7) * 0.6, Math.cos(i * 2.3) * 0.6, 3000 + i * 1000, i % 2 ? 4 : 12);
    expect(session.position).toEqual(origin);
    expect(JSON.parse(session.recorder.report()).events.filter((e: any) => e.type === 'movement.accepted')).toHaveLength(0);
  });
  it('rejects slow stationary drift even after it exceeds the reduced deadband', () => {
    const { session, send } = setup(); const origin = session.position;
    for (let i = 1; i <= 120; i++) send(i * 0.05, 0, 3000 + i * 1000);
    expect(session.position).toEqual(origin);
    expect(session.snapshot(123000).lastMovementTimestamp).toBeNull();
    expect(JSON.parse(session.recorder.report()).events.some((e: any) => e.data.reason === 'insufficient-recent-speed')).toBe(true);
  });
  it('holds during a pause and resumes after fresh walking evidence', () => {
    const { session, send } = setup();
    for (let i = 1; i <= 10; i++) send(i * 0.4, 0, 3000 + i * 1000);
    const stopped = session.position;
    for (let i = 1; i <= 4; i++) send(4 + Math.sin(i) * 0.06, 0, 13000 + i * 1000);
    expect(session.position).toEqual(stopped);
    const resumed: number[] = [];
    for (let i = 1; i <= 10; i++) if (send(4 + i * 0.4, 0, 17000 + i * 1000)) resumed.push(i);
    expect(resumed[0]).toBeLessThanOrEqual(5); expect(session.position!.east).toBeCloseTo(8, 5);
  });
  it('logs configured thresholds and actual movement/acceptance intervals without physical coordinates', () => {
    const { session, send } = setup();
    for (let i = 1; i <= 10; i++) send(i * 0.4, 0, 3000 + i * 1000);
    const events = JSON.parse(session.recorder.report()).events;
    expect(events.find((e: any) => e.type === 'session.config').data).toMatchObject(PHYSICAL_WALK_TUNING.movement);
    expect(events.filter((e: any) => e.type === 'position.accepted').at(-1).data).toMatchObject({ acceptedFixGapMs: 1000, acceptedDeliveryGapMs: 1000 });
    expect(events.filter((e: any) => e.type === 'movement.accepted').at(-1).data).toMatchObject({ movementIntervalMs: 1000, consistentEvidence: true });
    expect(events.every((e: any) => !('latitude' in e.data) && !('longitude' in e.data))).toBe(true);
  });
  it('allows isolated per-session tuning without changing global defaults', () => {
    const tuning = { ...PHYSICAL_WALK_TUNING, movement: { ...PHYSICAL_WALK_TUNING.movement, deadbandMinMeters: 100, evidenceMinMeters: 100 } };
    const session = new PhysicalWalkSession(true, new PhysicalWalkRecorder(), tuning);
    session.start({ sessionId: 'custom', mapId: 'remote', floorId: 'g', anchor }, 0);
    for (let i = 1; i <= 20; i++) session.ingest({ ...offset(physical, { east: Math.max(0, i - 3), north: 0 }), accuracy: 4, timestamp: i * 1000, source: 'gps' }, i * 1000);
    expect(session.position!.east).toBe(0); expect(PHYSICAL_WALK_TUNING.movement.deadbandMinMeters).toBe(1.2);
  });
});
describe('rendered-position interpolation contract', () => {
  it('uses the last submitted frame despite a later diagnostic sample and missed frames', () => {
    const a = new PositionInterpolation(); a.setTarget(anchor, 0); a.markRendered(a.sample(0)!);
    a.setTarget({ ...offset(anchor, { east: 10, north: 0 }), floorId: 'g' }, 1000);
    const drawn = a.sample(1200)!; a.markRendered(drawn);
    a.sample(5000); // A read-only diagnostic sample is not evidence of drawing.
    a.setTarget({ ...offset(anchor, { east: 20, north: 0 }), floorId: 'g' }, 5000);
    expect(a.sample(5000)).toEqual(drawn);
    expect(displacement(anchor, a.sample(5800)!).east).toBeCloseTo(20, 5);
  });
  it('does not restart an unfinished animation when the endpoint is repeated', () => {
    const a = new PositionInterpolation(); a.setTarget(anchor, 0); a.markRendered(a.sample(0)!);
    const target = { ...offset(anchor, { east: 10, north: 0 }), floorId: 'g' };
    a.setTarget(target, 1000); a.markRendered(a.sample(1400)!);
    a.setTarget(target, 1400);
    expect(a.complete(1800)).toBe(true); expect(displacement(anchor, a.sample(1800)!).east).toBeCloseTo(10, 5);
  });
  it('preserves continuity across consecutive targets and stops at the last target', () => {
    const a = new PositionInterpolation(); a.setTarget(anchor, 0); a.markRendered(a.sample(0)!);
    for (let i = 1; i <= 10; i++) {
      const now = i * 200; const drawn = a.sample(now)!; a.markRendered(drawn);
      a.setTarget({ ...offset(anchor, { east: i, north: 0 }), floorId: 'g' }, now);
      expect(a.sample(now)).toEqual(drawn);
    }
    expect(a.sample(5000)).toEqual(a.sample(100000));
    a.reset(); expect(a.sample(100001)).toBeNull();
  });
});

it('does not convert stationary GPS cluster changes into route distance', () => {
  const { session, send } = setup();
  const route = new RouteGuidedWalk([anchor, { ...offset(anchor, { east: 100, north: 0 }), floorId: 'g' }]);
  const origin = session.position;
  // A seated phone can report repeated fixes in a displaced cluster, then return.
  // These are not a sustained trajectory even when two fixes agree.
  for (let i = 1; i <= 120; i++) {
    send(Math.floor((i - 1) / 2) % 2 ? 0 : 3, 0, 3000 + i * 1000);
    const increment = session.snapshot(3000 + i * 1000).walkingIncrement;
    if (increment) route.commit(increment);
  }
  expect(route.progress).toBe(0);
  expect(session.position).toEqual(origin);
  expect(session.snapshot(123000).lastMovementTimestamp).toBeNull();
});
