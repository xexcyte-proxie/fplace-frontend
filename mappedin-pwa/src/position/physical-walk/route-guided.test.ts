import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteGuidedWalk } from './route-guided';
import { PhysicalWalkNavigation } from './navigation';
import { PositionInterpolation } from './render-interpolation';
import { offset } from './transform';
import { coordinateTransformationService as geometry } from '../../routing/coordinate-transformation-service';
import type { RoutePayload } from '../../types';
const anchor = { latitude: 0, longitude: 0, floorId: 'g' };
const point = (east: number, north: number) => ({ ...offset(anchor, { east, north }), floorId: 'g' });
const path = [anchor, point(10, 0), point(10, 15)];
const physical = { latitude: 6.5, longitude: 3.4 };
const sessions: PhysicalWalkNavigation[] = [];
afterEach(() => { sessions.forEach(s => s.end()); sessions.length = 0; vi.unstubAllGlobals(); });
function harness() {
  let now = 1000;
  const host = { acquire: vi.fn(), release: vi.fn(), render: vi.fn(), progress: vi.fn() };
  const geo = { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() } as unknown as Geolocation;
  const nav = new PhysicalWalkNavigation(host, () => now); sessions.push(nav);
  let selected = { pathCoordinates: path.map(p => ({ ...p })), durationSeconds: 1 } as RoutePayload;
  const start = () => nav.start({ sessionId: String(now), mapId: 'remote', floorId: 'g', anchor }, selected, geo, 'route-guided');
  const send = (east: number, north: number, t: number, timestamp = t, accuracy = 4) => {
    now = t; nav.ingest({ ...offset(physical, { east, north }), timestamp, accuracy, source: 'gps' });
  };
  start(); for (const t of [1000, 2000, 3000]) send(0, 0, t);
  return { nav, host, geo, send, start, selected, replace: () => { selected = { ...selected, pathCoordinates: [...selected.pathCoordinates] }; }, time: (t: number) => { now = t; } };
}
describe('route-guided engine', () => {
  it('commits 5m as 5m once and follows the L turn at 12m', () => {
    const e = new RouteGuidedWalk(path); const event = { sequence: 1, meters: 5, timestamp: 1 };
    expect(e.commit(event)).toBe(5); expect(e.progress).toBe(5); expect(e.commit(event)).toBe(0);
    e.commit({ sequence: 2, meters: 7, timestamp: 2 }); expect(e.at().segmentIndex).toBe(1);
    expect(e.at().latitude).toBeCloseTo(point(10, 2).latitude, 9); expect(e.at().longitude).toBeCloseTo(point(10, 2).longitude, 9);
  });
  it('keeps animated points on the polyline and retargets from the last drawn position', () => {
    const animation = new PositionInterpolation(); animation.setRoute(path);
    animation.setTarget({ ...path[2], distanceAlongRoute: 20 }, 1000);
    for (let t = 1000; t < 1400; t++) {
      const p = animation.sample(t)!; animation.markRendered(p);
      expect(geometry.snapToRoute(path, p.latitude, p.longitude)!.offRouteMeters).toBeLessThan(0.00001);
    }
    const drawn = animation.sample(1400)!; animation.markRendered(drawn);
    animation.setTarget({ ...path[2], distanceAlongRoute: 25 }, 1500);
    expect(animation.sample(1500)).toEqual(drawn);
    for (let t = 1500; t <= 2100; t++) expect(geometry.snapToRoute(path, animation.sample(t)!.latitude, animation.sample(t)!.longitude)!.offRouteMeters).toBeLessThan(0.00001);
  });
  it('arrives only at committed length despite endpoint proximity and clamps overshoot', () => {
    const e = new RouteGuidedWalk([anchor, point(10, 0), anchor]); expect(e.arrived).toBe(false);
    e.commit({ sequence: 1, meters: 19, timestamp: 1 }); expect(e.arrived).toBe(false);
    e.commit({ sequence: 2, meters: 4, timestamp: 2 }); expect(e.arrived).toBe(true); expect(e.progress).toBe(e.length); expect(e.remaining).toBe(0);
  });
  it('validates geometry and preserves the original route', () => {
    expect(() => new RouteGuidedWalk([])).toThrow(); expect(() => new RouteGuidedWalk([anchor, anchor])).toThrow();
    expect(() => new RouteGuidedWalk([anchor, { ...path[1], floorId: 'other' }])).toThrow();
    const original = JSON.stringify(path); const e = new RouteGuidedWalk(path); e.commit({ sequence: 1, meters: 12, timestamp: 1 }); expect(JSON.stringify(path)).toBe(original);
  });
});
describe('route-guided physical integration', () => {
  it('excludes origin capture, controlled jitter, duplicates, stale fixes and heading-only ticks', () => {
    const h = harness(); expect(h.nav.metrics!.physicalMeters).toBe(0);
    for (let t = 4000; t < 13000; t += 1000) h.send(t % 2000 ? 0.1 : -0.1, 0, t);
    h.send(100, 0, 13000, 12000); h.send(100, 0, 14000, 1000);
    for (let i = 0; i < 10; i++) h.nav.update();
    expect(h.nav.metrics).toMatchObject({ physicalMeters: 0, alongMeters: 0, arrived: false });
  });
  it('follows a virtual turn while physical walking stays straight and holds arrival', () => {
    const h = harness(); for (let n = 1; n <= 35; n++) h.send(0, n, 3000 + n * 1000);
    expect(h.nav.metrics!.arrived).toBe(true); expect(h.nav.metrics!.remainingMeters).toBe(0);
    const last = h.host.render.mock.calls.at(-1)![0]; expect(last.latitude).toBeCloseTo(path[2].latitude, 9); expect(last.longitude).toBeCloseTo(path[2].longitude, 9);
    const count = h.host.render.mock.calls.length; h.send(0, 40, 40000); expect(h.host.render).toHaveBeenCalledTimes(count);
  });
  it('consumes accepted increments once and derives ETA with explicit 1.2m/s policy', () => {
    const h = harness(); for (let n = 1; n <= 8; n++) h.send(0, n, 3000 + n * 1000);
    const meters = h.nav.metrics!.alongMeters; expect(meters).toBeGreaterThan(4); expect(h.nav.metrics!.physicalMeters).toBeCloseTo(meters, 8);
    h.send(0, 8, 11000); h.nav.update(); expect(h.nav.metrics!.alongMeters).toBe(meters);
    expect(h.nav.metrics!.remainingSeconds).toBeCloseTo(h.nav.metrics!.remainingMeters / 1.2, 8);
  });
  it('excludes delayed callbacks and outage displacement without a heartbeat', () => {
    const h = harness(); for (let n = 1; n <= 6; n++) h.send(0, n, 3000 + n * 1000);
    const before = h.nav.metrics!.alongMeters; h.send(0, 20, 25000, 15000); expect(h.nav.metrics!.alongMeters).toBe(before);
    h.send(0, 20, 26000); h.send(0, 20, 27000); expect(h.nav.metrics!.alongMeters).toBe(before);
    for (let n = 21; n <= 25; n++) h.send(0, n, 28000 + (n - 21) * 1000);
    expect(h.nav.metrics!.alongMeters - before).toBeLessThanOrEqual(5.01);
  });
  it('resets route progress and isolates old session callbacks', () => {
    const h = harness(); for (let n = 1; n <= 6; n++) h.send(0, n, 3000 + n * 1000);
    const old = vi.mocked(h.geo.watchPosition).mock.calls[0][0]; h.replace(); h.time(12000); h.start(); expect(h.nav.metrics!.alongMeters).toBe(0);
    const count = h.host.render.mock.calls.length; old({ coords: { ...physical, accuracy: 4 }, timestamp: 12000 } as GeolocationPosition);
    expect(h.host.render).toHaveBeenCalledTimes(count);
  });
  it('stops when active route geometry changes', () => {
    const h = harness(); h.selected.pathCoordinates[1].latitude += 0.0001; h.nav.update(); expect(h.nav.running).toBe(false);
  });
  it('ends on background and requires a new origin', () => {
    const listeners = new Map<string, () => void>();
    const doc = { visibilityState: 'visible', addEventListener: vi.fn((name, cb) => listeners.set(name, cb)), removeEventListener: vi.fn() };
    vi.stubGlobal('document', doc); const h = harness(); doc.visibilityState = 'hidden'; listeners.get('visibilitychange')!();
    expect(h.nav.running).toBe(false); expect(h.geo.clearWatch).toHaveBeenCalledWith(1);
  });
});

it('excludes movement during origin capture even when the chosen origin is earlier', () => {
  const h = harness(); h.time(4000); h.start();
  h.send(0, 0, 4000); h.send(1, 0, 5000); h.send(2, 0, 6000);
  expect(h.nav.metrics!.alongMeters).toBe(0);
  for (let n = 3; n <= 10; n++) h.send(n, 0, 6000 + (n - 2) * 1000);
  expect(h.nav.metrics!.alongMeters).toBeGreaterThan(4);
  expect(h.nav.metrics!.alongMeters).toBeLessThanOrEqual(8.001);
});

it('exports mode, build, candidate, commit, segment and arrival diagnostics without physical coordinates', () => {
  const h = harness(); for (let n = 1; n <= 35; n++) h.send(0, n, 3000 + n * 1000);
  const report = h.nav.recorder.report(); const events = JSON.parse(report).events;
  expect(events.find((e: any) => e.type === 'demo.mode').data).toMatchObject({ mode: 'route-guided', buildFingerprint: expect.any(String) });
  expect(events.some((e: any) => e.type === 'walking-distance.candidate')).toBe(true);
  const arrival = events.find((e: any) => e.type === 'route-guided.commit' && e.data.arrived);
  expect(arrival.data).toMatchObject({ reason: 'credible-walking-distance-reached-route-end', segmentIndex: 1, remainingMeters: 0, accuracy: 4 });
  for (const event of events) {
    expect(event.data).not.toHaveProperty('latitude'); expect(event.data).not.toHaveProperty('longitude');
    expect(Object.values(event.data)).not.toContain(physical.latitude); expect(Object.values(event.data)).not.toContain(physical.longitude);
  }
});
