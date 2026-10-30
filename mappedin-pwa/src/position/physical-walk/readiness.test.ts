import { describe, expect, it, vi } from 'vitest';
import { PhysicalWalkSession, physicalWalkEnabled, type PhysicalFix } from './session';
const R = 6371000;
const origin = { latitude: 6.5, longitude: 3.4 };
const anchor = { latitude: 43.46, longitude: -80.52 };
const opts = { sessionId: 'readiness', mapId: 'remote-map', floorId: 'floor-1', anchor };
// Independent fixture generation: intentionally does not use production transform helpers.
function fix(e: number, n: number, t: number, accuracy = 4): PhysicalFix {
  return { latitude: origin.latitude + n / R * 180 / Math.PI,
    longitude: origin.longitude + e / (R * Math.cos(origin.latitude * Math.PI / 180)) * 180 / Math.PI,
    timestamp: t, accuracy, source: 'gps' };
}
function ready() {
  const s = new PhysicalWalkSession(true); s.start(opts, 0);
  for (const t of [1000, 2000, 3000]) s.ingest(fix(0, 0, t), t);
  return s;
}
function assertMetres(s: PhysicalWalkSession, east: number, north: number) {
  const p = s.position!;
  expect((p.latitude - anchor.latitude) * Math.PI / 180 * R).toBeCloseTo(north, 5);
  expect((p.longitude - anchor.longitude) * Math.PI / 180 * R * Math.cos(anchor.latitude * Math.PI / 180)).toBeCloseTo(east, 5);
}
describe('Phase 1 readiness verification', () => {
  it('defaults off and construction/start do not access hardware or DOM', () => {
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', undefined);
    const gps = vi.fn(); const ui = vi.fn();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: gps } });
    vi.stubGlobal('document', { createElement: ui });
    try {
      expect(physicalWalkEnabled()).toBe(false);
      expect(() => new PhysicalWalkSession().start(opts)).toThrow('disabled');
      new PhysicalWalkSession(true).start(opts, 0);
      expect(gps).not.toHaveBeenCalled(); expect(ui).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
  });
  it('holds stationary, reaches 10m north then 5m east, backtracks, rejects stale and resets', () => {
    const s = ready(); const initial = s.position;
    for (let t = 4000; t <= 6000; t += 1000) s.ingest(fix(0.1, -0.1, t), t);
    expect(s.position).toEqual(initial);
    // Repeated endpoint samples confirm displacement without scripted advancement.
    s.ingest(fix(0, 10, 10000), 10000); s.ingest(fix(0, 10, 11000), 11000); assertMetres(s, 0, 10);
    s.ingest(fix(5, 10, 14000), 14000); s.ingest(fix(5, 10, 15000), 15000); assertMetres(s, 5, 10);
    s.ingest(fix(0, 10, 18000), 18000); s.ingest(fix(0, 10, 19000), 19000); assertMetres(s, 0, 10);
    const accepted = s.position;
    for (const sample of [fix(10, 10, 20000), fix(100, 0, 20000, 100)]) {
      expect(s.ingest(sample, 40000)).toBeNull(); expect(s.position).toEqual(accepted);
    }
    const report = JSON.parse(s.recorder.report());
    for (const event of report.events) {
      expect(event.data).not.toHaveProperty('latitude'); expect(event.data).not.toHaveProperty('longitude');
      expect(event.data).not.toHaveProperty('origin');
    }
    s.reset({ ...opts, sessionId: 'readiness-reset' }, 41000); expect(s.position).toBeNull();
    for (const t of [42000, 43000, 44000]) s.ingest(fix(20, 20, t), t);
    assertMetres(s, 0, 0);
  });
  it('keeps observation fresh and movement provenance unchanged while stationary', () => {
    const s = ready();
    for (let t = 4000; t <= 23000; t += 1000) s.ingest(fix(0, 0, t), t);
    expect(s.state).toBe('active');
    expect(s.snapshot(23000).observation?.timestamp).toBe(23000);
    expect(s.snapshot(23000).positionFresh).toBe(true);
    expect(s.position!.timestamp).toBe(1000);
    expect(s.snapshot(23000).lastMovementTimestamp).toBeNull();
    assertMetres(s, 0, 0);
  });
  it('requires consecutive valid recovery evidence after a rejection', () => {
    const s = ready(); s.checkFreshness(20000);
    s.ingest(fix(10, 0, 21000), 21000);
    s.ingest(fix(10, 0, 22000, 100), 22000);
    expect(s.ingest(fix(11, 0, 23000), 23000)).toBeNull();
    expect(s.state).toBe('degraded');
  });
  it('does not refresh trusted observation for inaccurate, duplicate, out-of-order, jump or non-GPS input', () => {
    const s = ready(); const before = s.snapshot(3000).observation;
    for (const f of [fix(0, 0, 4000, 100), fix(0, 0, 3000), fix(0, 0, 2000),
      fix(100, 0, 4000), { ...fix(0, 0, 4000), source: 'compass' } as unknown as PhysicalFix]) {
      expect(s.ingest(f, 4000)).toBeNull(); expect(s.snapshot(4000).observation).toEqual(before);
    }
    s.checkFreshness(19000);
    expect(s.state).toBe('degraded'); expect(s.snapshot(19000).positionFresh).toBe(false);
    expect(s.position).not.toBeNull();
  });
  it('recovers readiness only after two consecutive fixes and does not reconstruct outage movement', () => {
    const s = ready(); const before = s.position; s.checkFreshness(20000);
    expect(s.ingest(fix(10, 0, 21000), 21000)).toBeNull();
    expect(s.snapshot(21000).recoveryObservations).toBe(1);
    expect(s.ingest(fix(11, 0, 22000), 22000)).toBeNull();
    expect(s.state).toBe('active'); expect(s.position).toEqual(before);
    expect(s.snapshot(22000).lastMovementTimestamp).toBeNull();
    expect(s.ingest(fix(14, 0, 23000), 23000)).toBeNull();
    expect(s.ingest(fix(14, 0, 24000), 24000)).not.toBeNull();
    const movement = s.position;
    s.ingest(fix(14, 0, 25000), 25000);
    expect(s.position).toEqual(movement); expect(s.snapshot(25000).lastMovementTimestamp).toBe(24000);
    expect(s.snapshot(25000).observation?.timestamp).toBe(25000);
  });
  it.each(['duplicate', 'out-of-order', 'compass', 'timeout'])('interrupts recovery on %s without counting timers as evidence', kind => {
    const s = ready(); s.checkFreshness(20000); s.ingest(fix(10, 0, 21000), 21000);
    if (kind === 'timeout') {
      s.checkFreshness(37000); s.checkFreshness(37001);
      expect(s.snapshot(37001).recoveryObservations).toBe(0);
      s.ingest(fix(10, 0, 38000), 38000); expect(s.state).toBe('degraded');
    } else {
      const f = kind === 'duplicate' ? fix(10, 0, 21000) : kind === 'out-of-order' ? fix(10, 0, 20000) :
        { ...fix(10, 0, 22000), source: 'compass' } as unknown as PhysicalFix;
      s.ingest(f, 22000); expect(s.snapshot(22000).recoveryObservations).toBe(0);
      s.checkFreshness(22000); expect(s.snapshot(22000).recoveryObservations).toBe(0);
      s.ingest(fix(11, 0, 23000), 23000); expect(s.state).toBe('degraded');
    }
  });
  it('browser errors reset recovery and old-session success/error callbacks are isolated', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(3000); const s = ready();
      let success: PositionCallback | undefined; let error: PositionErrorCallback | null | undefined;
      const clearWatch = vi.fn();
      const geo = { watchPosition: vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => { success = ok; error = fail; return 1; }), clearWatch } as unknown as Geolocation;
      s.watch(geo); s.checkFreshness(20000); s.ingest(fix(10, 0, 21000), 21000);
      vi.setSystemTime(21500); error?.({ code: 2 } as GeolocationPositionError);
      expect(s.snapshot(21500).recoveryObservations).toBe(0);
      s.ingest(fix(11, 0, 22000), 22000); expect(s.state).toBe('degraded');
      s.ingest(fix(12, 0, 23000), 23000); expect(s.state).toBe('active');
      const oldPosition = s.position;
      s.reset({ ...opts, sessionId: 'new-session' }, 24000);
      vi.setSystemTime(25000);
      success?.({ coords: { ...origin, accuracy: 4 }, timestamp: 25000 } as GeolocationPosition);
      error?.({ code: 2 } as GeolocationPositionError);
      expect(s.state).toBe('capturing-origin'); expect(s.position).toBeNull();
      expect(s.snapshot(25000).observation).toBeNull(); expect(oldPosition).not.toBeNull();
      expect(clearWatch).toHaveBeenCalledWith(1);
    } finally { vi.useRealTimers(); }
  });

  it('does not accept outage displacement from repeated stationary recovery observations', () => {
    const s = ready(); const before = s.position; s.checkFreshness(20000);
    for (let t = 21000; t <= 30000; t += 1000) s.ingest(fix(10, 0, t), t);
    expect(s.state).toBe('active'); expect(s.position).toEqual(before);
    expect(s.snapshot(30000).observation?.timestamp).toBe(30000);
    expect(s.snapshot(30000).lastMovementTimestamp).toBeNull();
  });

});
