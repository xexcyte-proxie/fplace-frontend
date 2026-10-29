import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const script = (name: string) => readFileSync(new URL(`../../../ar-nav/js/${name}.js`, import.meta.url), 'utf8');
export function diagnosticRuntime() {
  let time = 0;
  const c: any = { performance: { now: () => time }, Date, Math };
  c.window = c; c.parent = { postMessage: vi.fn() }; c.location = { origin: 'https://test' };
  vm.createContext(c);
  const load = (name: string) => vm.runInContext(script(name), c);
  load('navigation-diagnostics-core');
  const d = c.createFplacesNavigationDiagnostics({ capacity: 20, clock: () => time, wall: () => 1700000000000 + time });
  c.FplacesNavigationDiagnostics = d;
  const report = (privacy?: string) => JSON.parse(d.export(privacy));
  return { c, d, load, report, tick: (ms = 1000) => { time += ms; } };
}

describe('navigation evidence recorder', () => {
  it('starts stopped, bounds events, preserves sequence, causal links and dropped totals', () => {
    const { d, report } = diagnosticRuntime();
    d.record('ignored', 'test'); expect(report().eventTimeline).toHaveLength(0);
    d.start(); const cause = d.record('raw-gps', 'GPS', { accuracy: 20 }); d.cause = cause;
    for (let i = 0; i < 40; i++) d.record('progress', 'snap', { i });
    const r = report(); expect(r.eventTimeline).toHaveLength(20); expect(r.summaryStatistics.dropped).toBe(22);
    expect(r.eventTimeline[0].cause).toBe(cause); expect(r.eventTimeline.at(-1).sequence).toBe(42);
    expect(r.eventTimeline[0].wallTime).toBe('2023-11-14T22:13:20.000Z');
    d.stop(); const count = report().eventTimeline.length; d.record('ignored', 'test'); expect(report().eventTimeline).toHaveLength(count);
    d.clear(); expect(report().eventTimeline).toHaveLength(0); expect(report().summaryStatistics.dropped).toBe(0);
  });
  it('deep copies snapshots and preserves stop-state while live sensors continue', () => {
    const { d, report } = diagnosticRuntime(); const point = { latitude: 6, longitude: 3 };
    d.update('position', 'GPS', { filtered: point }); d.start(); point.latitude = 9;
    expect(report('absolute').initialPositioningState.position.filtered.latitude).toBe(6);
    d.stop(); d.update('position', 'GPS', { filtered: point });
    expect(report('absolute').finalPositioningState.position.filtered.latitude).toBe(6);
  });
  it('redacts nested coordinates and secrets; independent offset spaces preserve displacement', () => {
    const { d, report } = diagnosticRuntime(); d.start();
    d.record('position', 'test', { raw: { latitude: 43, longitude: -80 }, translated: { latitude: 6, longitude: 3 }, apiKey: 'never-export', token: 'never-export' });
    d.record('position', 'test', { raw: { latitude: 43.00001, longitude: -80 }, translated: { latitude: 6.00001, longitude: 3 } });
    expect(d.export()).not.toContain('never-export'); expect(report().eventTimeline[1].data.raw.latitude).toBeNull();
    const offset = report('offset').eventTimeline;
    expect(offset[1].data.raw.localNorthM).toBe(0); expect(offset[1].data.translated.localNorthM).toBe(0);
    expect(offset[2].data.raw.localNorthM).toBeCloseTo(1.11195); expect(offset[2].data.translated.localNorthM).toBeCloseTo(1.11195);
    expect(d.export('offset')).not.toContain('"latitude"'); expect(report('absolute').eventTimeline[1].data.raw.latitude).toBe(43);
  });
  it('freezes coordinates, retains live heading, never mutates raw GPS, and warns about observed progress', () => {
    const { d, report, tick } = diagnosticRuntime(); d.start();
    d.accept({ latitude: 6, longitude: 3, accuracy: 5, heading: 0 }); d.setFrozen(true);
    const raw = { latitude: 6.001, longitude: 3, accuracy: 8, heading: 90, timestamp: 123 };
    expect(d.accept(raw)).toMatchObject({ latitude: 6, heading: 90, timestamp: 123 }); expect(raw.latitude).toBe(6.001);
    d.update('progress', 'authority', { alongPathMeters: 1 }); tick(); d.update('progress', 'authority', { alongPathMeters: 3 });
    expect(report().diagnosticWarnings[0].data.observation).toContain('Progress changed');
    d.setFrozen(false); expect(d.accept(raw)).toEqual(raw);
  });
  it('observes identical positions and AR disagreement without changing progress', () => {
    const { d, report, tick } = diagnosticRuntime(); d.start(); const frame = { latitude: 6, longitude: 3, accuracy: 4 };
    d.update('position', 'test', { filtered: frame }); d.update('position', 'test', { filtered: frame });
    d.update('progress', 'test', { alongPathMeters: 2 }); tick(); d.update('progress', 'test', { alongPathMeters: 4 });
    d.update('ar-sample', 'test', { progress: { selectedAlongM: 10 }, parentAlongM: 4 });
    expect(report().diagnosticWarnings).toHaveLength(2); expect(report().finalPositioningState.progress.alongPathMeters).toBe(4);
  });
  it('rejects early AR arrival and waits for parent confirmed completion', () => {
    const { c, d, load, report } = diagnosticRuntime(); load('route-navigator'); d.start();
    const nav = new c.FplacesRouteNavigator();
    c.FplacesRouteGeometry = { totalPathLengthMeters: () => 10 };
    nav.route = { pathCoordinates: [{ latitude: 6, longitude: 3 }, { latitude: 6.0001, longitude: 3 }] };
    nav.notify = vi.fn(); nav.applyPosition = vi.fn();
    nav.applyNavigationSync({ alongPathMeters: 6, routeRemainingMeters: 4, latitude: 6, longitude: 3, diagnosticCause: 77 });
    expect(nav.arrived).toBe(false); expect(c.parent.postMessage).not.toHaveBeenCalled();
    nav.applyArrivalLatch(0, undefined, 'advanceAlongPath'); expect(nav.arrived).toBe(false);
    expect(report().arrivalEvaluations[0]).toMatchObject({ source: 'RouteNavigator.applyNavigationSync', data: { thresholdM: 0.75, triggered: false } });
    nav.applyNavigationSync({ alongPathMeters: 10, latitude: 6.0001, longitude: 3, routeRemainingMeters: 0, routeSimulationComplete: true });
    expect(nav.arrived).toBe(true); expect(c.parent.postMessage).toHaveBeenCalledTimes(1);
  });
  it('keeps the marker world coordinate fixed through camera motion, rotation and anchor changes', () => {
    const { c, d, load, report, tick } = diagnosticRuntime();
    class V { constructor(public x=0, public y=0, public z=0) {} copy(p: V) { Object.assign(this,p); return this; } clone() { return new V(this.x,this.y,this.z); } }
    c.THREE = { Vector3: V, SphereGeometry: class { dispose() {} }, MeshBasicMaterial: class { dispose() {} },
      Mesh: class { position=new V(); constructor(public geometry: any,public material: any) {} } };
    const scene = { add: vi.fn(), remove: vi.fn() }; let offset = 0;
    const camera = { updateMatrixWorld() {}, localToWorld(p: V) { p.x += offset; return p; }, worldToLocal(p: V) { p.x -= offset; return p; } };
    c.FplacesAnchorEngine = { instance: { revision: 1 } }; load('stationary-diagnostic-marker'); d.start(); d.setMarker(true);
    c.FplacesStationaryMarker.attach(scene,camera); c.FplacesStationaryMarker.update();
    offset = 8; c.FplacesAnchorEngine.instance.revision = 2; tick(); c.FplacesStationaryMarker.update();
    const samples = report().arrowLifecycleEvents.filter((e: any) => e.source === 'StationaryMarker.sample');
    expect(samples[0].data.world).toEqual(samples[1].data.world); expect(samples[1].data.cameraRelative.x).toBe(-8);
    expect(scene.add).toHaveBeenCalledTimes(1); d.setMarker(false); c.FplacesStationaryMarker.update(); expect(scene.remove).toHaveBeenCalledTimes(1);
  });
});


describe('2D shared recorder evidence', () => {
  it('records transitions, correlation, severity and sampled numeric values without per-frame duplication', () => {
    const { d, tick, report } = diagnosticRuntime(); d.start();
    d.update('provider-state', 'GPS', { subscription: true, signal: 'starting', reason: 'watch-start', interactionId: 'tap-1' });
    d.update('provider-state', 'GPS', { subscription: true, signal: 'active', reason: 'fresh-fix', interactionId: 'tap-1' });
    const event = report('absolute').eventTimeline.at(-1);
    expect(event).toMatchObject({ category: 'provider', severity: 'info', reason: 'fresh-fix', interactionId: 'tap-1', previousState: { signal: 'starting' }, newState: { signal: 'active' } });
    const count = d.statistics().retained;
    for (let i = 0; i < 100; i++) d.update('provider-state', 'GPS', { subscription: true, signal: 'active', reason: 'fresh-fix', interactionId: 'tap-1' });
    expect(d.statistics().retained).toBe(count);
    d.sample('compass-raw', 'sensor', { heading: 10 });
    d.sample('compass-raw', 'sensor', { heading: 11 });
    tick(200); d.sample('compass-raw', 'sensor', { heading: 12 });
    expect(d.timeline().filter((event: any) => event.type === 'compass-raw')).toHaveLength(2);
    d.record('error', 'sensor', { reason: 'permission-denied', severity: 'error' });
    expect(report().diagnosticWarnings.at(-1).severity).toBe('error');
  });
});
