import { describe, expect, it, vi } from 'vitest';
import { displacement, offset } from './transform';
import { PhysicalWalkSession, physicalWalkEnabled, type PhysicalFix } from './session';
import { PhysicalWalkRecorder } from './recorder';
const physical = { latitude: 6.5, longitude: 3.4 };
const anchor = { latitude: 43.46, longitude: -80.52 };
const options = { sessionId: 'fixture-1', mapId: 'demo', floorId: 'ground', anchor };
const fix = (east: number, north: number, timestamp: number, accuracy = 4): PhysicalFix =>
  ({ ...offset(physical, { east, north }), timestamp, accuracy, source: 'gps' });
function ready() {
  const session = new PhysicalWalkSession(true); session.start(options, 0);
  session.ingest(fix(0, 0, 1000), 1000); session.ingest(fix(0, 0, 2000), 2000);
  session.ingest(fix(0, 0, 3000), 3000); return session;
}
describe('physical walk foundation', () => {
  it('requires explicit feature activation', () => {
    expect(() => new PhysicalWalkSession(false).start(options)).toThrow('disabled');
  });
  it('preserves metres across latitude and cardinal directions', () => {
    for (const delta of [{ east: 20, north: 0 }, { east: 0, north: -20 }, { east: -10, north: 30 }]) {
      const d = displacement(physical, offset(physical, delta));
      const result = displacement(anchor, offset(anchor, d));
      expect(result.east).toBeCloseTo(delta.east, 5); expect(result.north).toBeCloseTo(delta.north, 5);
    }
    const p = { latitude: 0, longitude: 179.999 };
    expect(displacement(p, offset(p, { east: 300, north: 0 })).east).toBeCloseTo(300, 5);
    expect(() => offset(anchor, { east: 1001, north: 0 })).toThrow();
  });
  it('captures stable origin and preserves selected anchor and quality', () => {
    const s = ready(); expect(s.state).toBe('active');
    expect(s.position!.latitude).toBeCloseTo(anchor.latitude, 8);
    expect(s.position!.longitude).toBeCloseTo(anchor.longitude, 8);
    expect(s.position).toMatchObject({ floorId: 'ground', source: 'physical-gps-transformed', accuracy: 4, timestamp: 1000 });
  });
  it('does not capture unstable origin or inaccurate fixes', () => {
    const s = new PhysicalWalkSession(true); s.start(options, 0);
    s.ingest(fix(0, 0, 1000), 1000); s.ingest(fix(6, 0, 3000), 3000);
    s.ingest(fix(12, 0, 5000), 5000); s.ingest(fix(0, 0, 6000, 31), 6000);
    expect(s.position).toBeNull();
  });
  it('retains original accepted timestamp for jitter, duplicate and stale fixes', () => {
    const s = ready(); const before = s.position;
    for (let t = 4000; t <= 12000; t += 1000) s.ingest(fix(t % 3 * 0.2, 0.2, t), t);
    s.ingest(fix(50, 0, 12000), 12000); s.ingest(fix(10, 0, 13000), 40000);
    expect(s.position).toEqual(before);
  });
  it('accepts sustained walking, L turn and backtracking', () => {
    const s = ready();
    for (let i = 1; i <= 10; i++) s.ingest(fix(0, i, 3000 + i * 1000), 3000 + i * 1000);
    expect(s.position!.north).toBeGreaterThan(6);
    for (let i = 1; i <= 8; i++) s.ingest(fix(i, 10, 13000 + i * 1000), 13000 + i * 1000);
    expect(s.position!.east).toBeGreaterThan(4);
    for (let i = 1; i <= 8; i++) s.ingest(fix(8 - i, 10, 21000 + i * 1000), 21000 + i * 1000);
    expect(s.position!.east).toBeLessThan(3);
  });
  it('rejects jumps and requires evidence after signal loss', () => {
    const s = ready(); const before = s.position;
    s.ingest(fix(100, 0, 4000), 4000); expect(s.position).toEqual(before);
    s.checkFreshness(20000); expect(s.state).toBe('degraded');
    expect(s.ingest(fix(10, 0, 21000), 21000)).toBeNull();
    expect(s.ingest(fix(11, 0, 22000), 22000)).toBeNull();
    expect(s.state).toBe('active');
    expect(s.position).toEqual(before);
  });
  it('clears hardware watch and ignores callbacks after reset/end', () => {
    const s = ready(); let callback: PositionCallback | undefined;
    const clearWatch = vi.fn();
    s.watch({ watchPosition: vi.fn((cb: PositionCallback) => { callback = cb; return 7; }), clearWatch } as unknown as Geolocation);
    s.reset({ ...options, sessionId: 'fixture-2' }, 4000);
    callback?.({ coords: { ...physical, accuracy: 4 }, timestamp: 5000 } as GeolocationPosition);
    expect(clearWatch).toHaveBeenCalledWith(7); expect(s.position).toBeNull();
    s.end(6000); expect(s.ingest(fix(0, 0, 7000), 7000)).toBeNull();
  });
  it('redacts before storage and reports chronological truncation', () => {
    const r = new PhysicalWalkRecorder(2);
    r.record('gps.sample', { latitude: 6.5, longitude: 3.4, origin: physical, accuracy: 4 }, 1);
    expect(r.report()).not.toContain('latitude');
    r.record('fix.held', { reason: 'movement-evidence' }, 2); r.record('session.state', { state: 'ended' }, 3);
    const report = JSON.parse(r.report()); expect(report.droppedEvents).toBe(1);
    expect(report.events.map((e: { sequence: number }) => e.sequence)).toEqual([2, 3]);
  });
  it('reads the reversible flag without starting hardware', () => {
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '0'); expect(physicalWalkEnabled()).toBe(false);
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '1'); expect(physicalWalkEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });
  it('recovers liveness while stationary without refreshing accepted position', () => {
    const s = ready(); const before = s.position; s.checkFreshness(20000);
    s.ingest(fix(0, 0, 21000), 21000); s.ingest(fix(0, 0, 22000), 22000);
    expect(s.state).toBe('active'); expect(s.position).toEqual(before);
    expect(() => s.reset(options)).toThrow('new session ID');
  });
  it('copies JSON and creates a downloadable report', async () => {
    const r = new PhysicalWalkRecorder();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { appendChild: vi.fn() } });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      await r.copy(); expect(writeText).toHaveBeenCalledWith(r.report());
      r.download(); expect(link.download).toBe('physical-walk-diagnostics.json');
      expect(link.click).toHaveBeenCalledOnce(); vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith('blob:report');
    } finally { create.mockRestore(); revoke.mockRestore(); vi.useRealTimers(); vi.unstubAllGlobals(); }
  });

});
