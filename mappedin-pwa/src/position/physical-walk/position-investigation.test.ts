import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhysicalWalkSession } from './session';
import { PhysicalWalkRecorder } from './recorder';
import { PositionInterpolation } from './render-interpolation';
import { PositionPipelineAudit, positionDiagnosticsEnabled, positionOverlayEnabled } from './position-diagnostics';
import { mountPositionOverlay } from './position-overlay';
import { displacement, offset } from './transform';
import type { RoutePayload } from '../../types';
const physical = { latitude: 6.5, longitude: 3.4 };
const anchor = { latitude: 43.46, longitude: -80.52, floorId: 'g' };
const options = { sessionId: 'investigation', mapId: 'remote', floorId: 'g', anchor };
const route = { routeId: 'route', pathCoordinates: [anchor, { ...offset(anchor, { east: 0, north: 100 }), floorId: 'g' }] } as RoutePayload;
const fix = (east: number, north: number, timestamp: number, accuracy = 4) =>
  ({ ...offset(physical, { east, north }), timestamp, accuracy, source: 'gps' as const });
function ready() {
  const session = new PhysicalWalkSession(true); session.start(options, 0);
  for (const t of [1000, 2000, 3000]) session.ingest(fix(0, 0, t), t);
  return session;
}
afterEach(() => vi.unstubAllEnvs());
describe('diagnostic reproductions and corrected rendering regressions', () => {
  it('accepts coherent GPS drift with stationary ground truth', () => {
    const s = ready();
    // Ground truth stays at (0,0); the receiver reports a smooth drifting estimate.
    for (let i = 1; i <= 20; i++) s.ingest(fix(i * 0.5, 0, 3000 + i * 1000), 3000 + i * 1000);
    expect(s.position!.east).toBeCloseTo(10, 5);
    expect(s.snapshot(23000).lastMovementTimestamp).toBe(23000);
    const events = JSON.parse(s.recorder.report()).events;
    expect(events.some((e: any) => e.type === 'movement.accepted' && e.data.reason === 'sustained-low-scatter-trajectory')).toBe(true);
  });
  it('accepts a persistent GPS offset after reported accuracy changes', () => {
    const s = ready();
    s.ingest(fix(6, 0, 4000, 12), 4000);
    s.ingest(fix(6, 0, 5000, 3), 5000);
    s.ingest(fix(6, 0, 6000, 3), 6000);
    expect(s.position!.east).toBeCloseTo(6, 5);
  });
  it('can publish capture-window displacement after origin selection, without post-capture motion', () => {
    const s = new PhysicalWalkSession(true); s.start(options, 0);
    s.ingest(fix(0, 0, 1000, 1), 1000);
    s.ingest(fix(2, 0, 2000, 4), 2000);
    s.ingest(fix(4, 0, 3000, 4), 3000);
    expect(s.position!.east).toBe(0); expect(s.position!.timestamp).toBe(1000);
    s.ingest(fix(4, 0, 4000), 4000); s.ingest(fix(4, 0, 5000), 5000);
    expect(s.position!.east).toBeCloseTo(4, 5);
  });
  it('sparse 6m/10s observations never establish the required coherent evidence', () => {
    const s = ready(); const animation = new PositionInterpolation();
    animation.setTarget(s.position!, 3000);
    let acceptedAt = 0;
    for (const [east, time] of [[6, 13000], [12, 23000], [18, 33000]]) {
      const accepted = s.ingest(fix(east, 0, time), time);
      if (accepted) { animation.setTarget(accepted, time); acceptedAt = time; }
    }
    expect(acceptedAt).toBe(0);
    expect(s.position!.east).toBe(0);
    expect(animation.durationMs).toBeLessThanOrEqual(800);
    expect(animation.sample(acceptedAt + 800)).toEqual(animation.sample(acceptedAt + 9000));
  });
  it('rendering stops after 800ms even when observations are several seconds apart', () => {
    const a = new PositionInterpolation(); a.setTarget(anchor, 0); a.markRendered(a.sample(0)!);
    a.setTarget({ ...offset(anchor, { east: 10, north: 0 }), floorId: 'g' }, 10000);
    expect(a.durationMs).toBe(800); expect(a.sample(10800)).toEqual(a.sample(19999));
  });
  it('reversals require fresh evidence and eventually retrace accepted position', () => {
    const s = ready();
    for (let i = 1; i <= 10; i++) s.ingest(fix(i, 0, 3000 + i * 1000), 3000 + i * 1000);
    const forward = s.position!.east;
    for (let i = 9; i >= 0; i--) s.ingest(fix(i, 0, 14000 + (9 - i) * 1000), 14000 + (9 - i) * 1000);
    expect(s.position!.east).toBeLessThan(forward); expect(s.position!.east).toBeCloseTo(0, 5);
  });
  it('retargeting after missing frames preserves the last actually drawn point', () => {
    const a = new PositionInterpolation();
    a.setTarget(anchor, 0); a.markRendered(a.sample(0)!); a.setTarget({ ...offset(anchor, { east: 10, north: 0 }), floorId: 'g' }, 1000);
    const lastDrawn = a.sample(1200)!; a.markRendered(lastDrawn);
    expect(displacement(anchor, lastDrawn).east).toBeCloseTo(2.5, 5);
    // No frame draws between 1200 and 3000. A new GPS target arrives first.
    a.setTarget({ ...offset(anchor, { east: 20, north: 0 }), floorId: 'g' }, 3000);
    expect(displacement(lastDrawn, a.sample(3000)!).east).toBeCloseTo(0, 5);
  });
});
describe('opt-in position audit', () => {
  it.each([[0, 0, false], [1, 0, false], [0, 1, false], [1, 1, true]])('requires demo=%s and diagnostic=%s', (demo, diagnostic, expected) => {
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', String(demo)); vi.stubEnv('VITE_PHYSICAL_WALK_POSITION_DIAGNOSTICS', String(diagnostic));
    vi.stubEnv('VITE_PHYSICAL_WALK_POSITION_OVERLAY', '1');
    expect(positionDiagnosticsEnabled()).toBe(expected); expect(positionOverlayEnabled()).toBe(expected);
  });
  it('distinguishes axis mismatch, route deviation, interpolation and SDK mismatch', () => {
    const recorder = new PhysicalWalkRecorder(); const audit = new PositionPipelineAudit(recorder, () => 4000);
    audit.begin(options, route);
    const north = offset(anchor, { east: 0, north: 5 });
    recorder.record('position.accepted', { venueLatitude: north.latitude, venueLongitude: north.longitude, east: 5, north: 0, fixTimestamp: 3000 }, 3000);
    expect(audit.snapshot().acceptedTransformErrorM).toBeCloseTo(Math.sqrt(50), 3);
    const east = offset(anchor, { east: 5, north: 0 });
    recorder.record('position.accepted', { venueLatitude: east.latitude, venueLongitude: east.longitude, east: 5, north: 0, fixTimestamp: 4000 }, 4000);
    audit.projection(anchor, true, 4000);
    audit.marker('position.audit.marker-frame', { interpolatedLatitude: anchor.latitude, interpolatedLongitude: anchor.longitude,
      sdkLatitude: east.latitude, sdkLongitude: east.longitude, sdkFloorId: 'wrong-floor', modelLatitude: east.latitude, modelLongitude: east.longitude });
    const s = audit.snapshot();
    expect(s.acceptedTransformErrorM).toBeCloseTo(0, 5);
    expect(s.acceptedToProjectionM).toBeCloseTo(5, 4);
    expect(s.interpolatedToSdkM).toBeCloseTo(5, 4);
    expect(s.points.sdk?.floorId).toBe('wrong-floor');
    expect(s.sdkToModelM).toBeCloseTo(0, 5);
    audit.dispose();
  });
  it('reports selected anchor, route start and green marker separately', () => {
    const audit = new PositionPipelineAudit(new PhysicalWalkRecorder(), () => 0);
    const selected = offset(anchor, { east: 8, north: 0 });
    audit.begin({ ...options, anchor: selected }, route); audit.greenMarker({ ...selected, floorId: 'g' });
    expect(audit.snapshot().anchorToRouteStartM).toBeCloseTo(8, 4);
    expect(audit.snapshot().points.green).toEqual({ ...selected, floorId: 'g' }); audit.dispose();
  });
  it('retains the last qualified projection separately from an off-route candidate', () => {
    const audit = new PositionPipelineAudit(new PhysicalWalkRecorder(), () => 0); audit.begin(options, route);
    audit.projection(anchor, true, 1000);
    const later = route.pathCoordinates[1]; audit.projection(later, false, 2000);
    expect(audit.snapshot().points.projected).toEqual(anchor); expect(audit.snapshot().points.candidate).toEqual(later); audit.dispose();
  });
  it('separates attempted, trusted observation and accepted timestamps', () => {
    let now = 3000; const recorder = new PhysicalWalkRecorder(); const audit = new PositionPipelineAudit(recorder, () => now);
    audit.begin(options, route);
    recorder.record('position.accepted', { venueLatitude: anchor.latitude, venueLongitude: anchor.longitude, fixTimestamp: 1000 }, 1000);
    recorder.record('observation.valid', { fixTimestamp: 2000 }, 2000);
    recorder.record('gps.sample', { fixTimestamp: 3000, accuracy: 100 }, 3000);
    recorder.record('fix.rejected', { reason: 'accuracy-gate' }, 3000);
    audit.marker('position.audit.marker-frame', { headingAgeMs: 1000 }); now = 4000;
    expect(audit.snapshot()).toMatchObject({ fixAgeMs: 1000, observationAgeMs: 2000, acceptedAgeMs: 3000, headingAgeMs: 2000, decision: 'fix.rejected: accuracy-gate' }); audit.dispose();
  });
  it('redacts physical coordinates and protects decisions from audit frame chatter', () => {
    const r = new PhysicalWalkRecorder(20); r.record('fix.rejected', { reason: 'accuracy-gate', latitude: 6.5, longitude: 3.4 }, 0);
    for (let i = 0; i < 1000; i++) r.record('position.audit.marker-frame', { sdkLatitude: 43, sdkLongitude: -80, latitude: 6.5, rawFix: physical }, i * 16);
    const report = JSON.parse(r.report());
    expect(report.events[0].type).toBe('fix.rejected'); expect(report.suppressedRepetitiveEvents).toBeGreaterThan(900);
    expect(report.events.every((e: any) => !('latitude' in e.data) && !('rawFix' in e.data))).toBe(true);
  });
  it('observer failures cannot interrupt GPS ingestion', () => {
    const s = ready(); const remove = s.recorder.subscribe(() => { throw new Error('diagnostic failure'); });
    expect(() => s.ingest(fix(0, 5, 6000), 6000)).not.toThrow();
    expect(() => s.ingest(fix(0, 5, 7000), 7000)).not.toThrow(); expect(s.position!.north).toBeCloseTo(5, 5); remove();
  });
  it('disabled overlay never touches the map; enabled overlay reuses and removes debug markers', () => {
    const audit = new PositionPipelineAudit(new PhysicalWalkRecorder(), () => 0); audit.begin(options, route);
    const map = { Markers: { add: vi.fn(() => ({ id: 'debug' })), setPosition: vi.fn(), remove: vi.fn() } };
    const coordinate = vi.fn((p: unknown) => p);
    vi.stubEnv('VITE_PHYSICAL_WALK_POSITION_OVERLAY', '0');
    mountPositionOverlay(audit, map as never, coordinate)(); expect(coordinate).not.toHaveBeenCalled();
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '1'); vi.stubEnv('VITE_PHYSICAL_WALK_POSITION_DIAGNOSTICS', '1'); vi.stubEnv('VITE_PHYSICAL_WALK_POSITION_OVERLAY', '1');
    const remove = mountPositionOverlay(audit, map as never, coordinate);
    audit.marker('position.audit.marker-frame', { sdkLatitude: anchor.latitude, sdkLongitude: anchor.longitude });
    audit.marker('position.audit.animation-complete', { sdkLatitude: anchor.latitude, sdkLongitude: anchor.longitude + 0.0001 });
    expect(map.Markers.add).toHaveBeenCalledOnce(); expect(map.Markers.setPosition).toHaveBeenCalledOnce();
    remove(); expect(map.Markers.remove).toHaveBeenCalledOnce(); audit.dispose();
  });
  it('enabling raw diagnostics preserves all accepted positions and freshness state', () => {
    const run = (enabled: boolean) => {
      vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '1'); vi.stubEnv('VITE_PHYSICAL_WALK_POSITION_DIAGNOSTICS', enabled ? '1' : '0');
      const s = ready(); const positions = [];
      for (let i = 1; i <= 20; i++) positions.push(s.ingest(fix(i * 0.5, 0, 3000 + i * 1000), 3000 + i * 1000));
      return { positions, snapshot: s.snapshot(23000), events: JSON.parse(s.recorder.report()).events };
    };
    const disabled = run(false); const enabled = run(true);
    expect(enabled.positions).toEqual(disabled.positions); expect(enabled.snapshot).toEqual(disabled.snapshot);
    expect(disabled.events.some((e: any) => e.type.startsWith('position.audit.'))).toBe(false);
    expect(enabled.events.filter((e: any) => e.type === 'position.audit.raw')).toHaveLength(20);
    expect(enabled.events.find((e: any) => e.type === 'position.audit.origin').data.originFixTimestamp).toBe(1000);
  });

});
