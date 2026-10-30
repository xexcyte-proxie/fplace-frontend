import { describe, expect, it, vi } from 'vitest';
import { PhysicalWalkNavigation } from './navigation';
import { offset } from './transform';
import type { RoutePayload } from '../../types';
const physical = { latitude: 6.5, longitude: 3.4 };
const anchor = { latitude: 43.46, longitude: -80.52, floorId: 'ground' };
const point = (east: number, north: number) => ({ ...offset(anchor, { east, north }), floorId: 'ground' });
const route = { pathCoordinates: [anchor, point(0, 20), point(20, 20)], durationSeconds: 40, legs: [], maneuvers: [] } as unknown as RoutePayload;
function harness() {
  let now = 1000;
  const host = { acquire: vi.fn(), release: vi.fn(), render: vi.fn(), progress: vi.fn() };
  const geo = { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() } as unknown as Geolocation;
  const controller = new PhysicalWalkNavigation(host, () => now);
  const start = () => controller.start({ sessionId: String(now), mapId: 'remote', floorId: 'ground', anchor }, route, geo);
  const send = (east: number, north: number, time: number, accuracy = 4) => {
    now = time; controller.ingest({ ...offset(physical, { east, north }), timestamp: now, accuracy, source: 'gps' });
  };
  start();
  for (const t of [1000, 2000, 3000]) send(0, 0, t);
  return { controller, host, geo, send, start, time: (t: number) => { now = t; } };
}
describe('2D physical walk integration controller', () => {
  it('acquires exclusively, renders selected anchor and restores on end', () => {
    const h = harness();
    try {
      expect(h.host.acquire).toHaveBeenCalledOnce();
      expect(h.host.render.mock.calls[0][0]).toMatchObject(anchor);
      expect(h.geo.watchPosition).toHaveBeenCalledOnce();
      h.controller.end(); expect(h.host.release).toHaveBeenCalledOnce(); expect(h.geo.clearWatch).toHaveBeenCalledWith(1);
    } finally { h.controller.end(); }
  });
  it('stationary observations and timer ticks cannot manufacture progress or physical distance', () => {
    const h = harness();
    try {
      const renders = h.host.render.mock.calls.length;
      for (let t = 4000; t <= 24000; t += 1000) h.send(0.1, 0.1, t);
      h.controller.update(); h.controller.update();
      expect(h.controller.metrics).toMatchObject({ alongMeters: 0, physicalMeters: 0, speedMps: 0 });
      expect(h.host.render).toHaveBeenCalledTimes(renders);
      expect(h.controller.status).toBe('Physical walk active');
    } finally { h.controller.end(); }
  });
  it('slow walking, direction changes and backtracking affect distinct route metrics', () => {
    const h = harness();
    try {
      for (let n = 1; n <= 10; n++) h.send(0, n, 3000 + n * 1000);
      const forward = h.controller.metrics!.alongMeters;
      expect(forward).toBeGreaterThan(6); expect(h.controller.metrics!.physicalMeters).toBeGreaterThan(6);
      for (let n = 9; n >= 0; n--) h.send(0, n, 14000 + (9 - n) * 1000);
      expect(h.controller.metrics!.alongMeters).toBeLessThan(forward);
      expect(h.controller.metrics!.physicalMeters).toBeGreaterThan(forward);
      expect(h.controller.metrics!.remainingSeconds).toBeCloseTo(h.controller.metrics!.remainingMeters, 3);
      expect(h.controller.metrics!.elapsedSeconds).toBeGreaterThan(0);
    } finally { h.controller.end(); }
  });
  it('does not follow a virtual turn when physical walking stays straight', () => {
    const h = harness();
    try {
      h.send(0, 20, 13000); h.send(0, 20, 14000);
      h.send(0, 30, 19000); h.send(0, 30, 20000);
      const last = h.host.render.mock.calls.at(-1)![0];
      expect(last.east).toBeCloseTo(0, 5); expect(last.north).toBeCloseTo(30, 5);
      expect(h.controller.metrics!.alongMeters).toBeLessThanOrEqual(20.01);
    } finally { h.controller.end(); }
  });
  it('rejects inaccurate fixes, excludes outages from distance and retains dot during recovery', () => {
    const h = harness();
    try {
      h.send(0, 6, 6000); h.send(0, 6, 7000);
      const before = h.controller.metrics!.physicalMeters; const count = h.host.render.mock.calls.length;
      h.send(100, 0, 8000, 100); expect(h.controller.metrics!.physicalMeters).toBe(before);
      h.time(24000); h.controller.update(); expect(h.controller.status).toContain('degraded');
      h.send(0, 10, 25000); h.send(0, 10, 26000); h.send(0, 10, 27000);
      expect(h.host.render).toHaveBeenCalledTimes(count);
      h.send(0, 14, 29000); h.send(0, 14, 30000);
      expect(h.controller.metrics!.physicalMeters).toBe(before);
    } finally { h.controller.end(); }
  });
  it('reset isolates old callbacks and recorder redacts physical coordinates', () => {
    const h = harness();
    try {
      const old = vi.mocked(h.geo.watchPosition).mock.calls[0][0];
      h.time(5000); h.start(); const count = h.host.render.mock.calls.length;
      old({ coords: { ...physical, accuracy: 4 }, timestamp: 6000 } as GeolocationPosition);
      expect(h.host.render).toHaveBeenCalledTimes(count);
      for (const event of JSON.parse(h.controller.recorder.report()).events) {
        expect(event.data).not.toHaveProperty('latitude'); expect(event.data).not.toHaveProperty('longitude');
      }
    } finally { h.controller.end(); }
  });
  it('capture timeout releases ownership and retry can start a new session', () => {
    const h = harness();
    try {
      h.time(5000); h.start(); h.time(35000); h.controller.update();
      expect(h.controller.running).toBe(false); expect(h.controller.status).toContain('timed out');
      h.time(36000); h.start(); expect(h.controller.running).toBe(true);
    } finally { h.controller.end(); }
  });
  it('compass-only input and repeated callbacks cannot move dot or advance metrics', () => {
    const h = harness();
    try {
      const rendered = h.host.render.mock.calls.length;
      h.time(4000);
      h.controller.ingest({ ...physical, accuracy: 4, timestamp: 4000, source: 'compass' } as any);
      h.send(0, 0, 5000); h.send(0, 0, 5000);
      expect(h.host.render).toHaveBeenCalledTimes(rendered);
      expect(h.controller.metrics).toMatchObject({ physicalMeters: 0, alongMeters: 0 });
    } finally { h.controller.end(); }
  });

  it('uses one projection for route metrics and styling while retaining unsnapped off-route authority', () => {
    const h = harness();
    try {
      h.send(0, 10, 9000); h.send(0, 10, 10000);
      h.host.progress.mockClear();
      h.send(8, 10, 15000); h.send(8, 10, 16000);
      const projected = h.host.progress.mock.calls.filter(([, point]) => point != null);
      expect(projected).toHaveLength(1);
      const [metrics, point] = projected[0];
      expect(metrics.alongMeters).toBeCloseTo(10, 3);
      expect(metrics.offRouteMeters).toBeCloseTo(8, 3);
      expect(metrics.remainingMeters).toBeCloseTo(38, 3);
      expect(metrics.percent).toBeCloseTo(25, 3);
      expect(point.longitude).toBeCloseTo(anchor.longitude, 8);
      expect(h.host.render.mock.calls.at(-1)![0].east).toBeCloseTo(8, 5);
      h.send(0, 10, 21000); h.send(0, 10, 22000);
      expect(h.controller.metrics!.offRouteMeters).toBeCloseTo(0, 3);
      expect(h.controller.metrics!.remainingMeters).toBeCloseTo(30, 3);
    } finally { h.controller.end(); }
  });

  it('characterizes the arrival latch suppressing later accepted blue-dot positions', () => {
    const h = harness();
    try {
      for (let n = 1; n <= 20; n++) h.send(0, n, 3000 + n * 1000);
      for (let e = 1; e <= 20; e++) h.send(e, 20, 23000 + e * 1000);
      h.send(20, 20, 44000); h.send(20, 20, 45000);
      expect(h.controller.metrics!.arrived).toBe(true);
      const renders = h.host.render.mock.calls.length;
      h.send(25, 20, 48000); h.send(25, 20, 49000);
      expect(h.host.render).toHaveBeenCalledTimes(renders);
      const accepted = JSON.parse(h.controller.recorder.report()).events.filter((e: any) => e.type === 'position.accepted');
      expect(accepted.at(-1).data.east).toBeCloseTo(25, 5);
    } finally { h.controller.end(); }
  });

});
