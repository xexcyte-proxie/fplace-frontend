import { recordLocationDiagnostic } from '../../location/domain/location-diagnostics';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginLocationButtonTrace, installLocationDiagnostics } from './location-button-trace';

beforeEach(() => {
  vi.stubGlobal('window', {});
  for (const method of ['log', 'warn', 'error', 'table', 'groupCollapsed', 'groupEnd'] as const) vi.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => { window.FplacesLocationDiagnostics?.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const exported = () => JSON.parse(window.FplacesLocationDiagnostics!.export());
describe('development location button traces', () => {
  it('snapshots actual coordinates, groups one summary, and supports copying a specific interaction', () => {
    const original = { latitude: 6.123456789, longitude: 3.5 };
    const trace = beginLocationButtonTrace(() => ({ selectedVenue: { id: 'venue', original } }))!;
    trace.step('Simulation', 'converted', () => ({ input: original, output: { latitude: 40.1, longitude: -80 }, offsetMeters: 12 }));
    original.latitude = 0;
    trace.finish('success', () => ({ calculated: { latitude: 40.1, longitude: -80 } }));
    trace.finish('duplicate');
    const report = exported();
    expect(report.context.selectedVenue.original.latitude).toBe(6.123456789);
    expect(report.events[1].values.input.latitude).toBe(6.123456789);
    expect(report.outcome).toBe('success');
    expect(window.FplacesLocationDiagnostics!.list()).toHaveLength(1);
    expect(JSON.parse(window.FplacesLocationDiagnostics!.export(report.interactionId))).toEqual(report);
    expect(console.groupCollapsed).toHaveBeenCalledOnce(); expect(console.groupEnd).toHaveBeenCalledOnce();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('COPYABLE DIAGNOSTIC SUMMARY'));
  });
  it('isolates overlapping interactions without holding a console group across awaits', () => {
    const a = beginLocationButtonTrace(() => ({ venue: 'a' }))!;
    const b = beginLocationButtonTrace(() => ({ venue: 'b' }))!;
    expect(console.groupCollapsed).not.toHaveBeenCalled();
    b.finish('failed'); a.finish('success');
    const list = window.FplacesLocationDiagnostics!.list();
    expect(list[0].interactionId).not.toBe(list[1].interactionId);
    expect(JSON.parse(window.FplacesLocationDiagnostics!.export(list[0].interactionId)).context.venue).toBe('b');
    expect(exported().context.venue).toBe('a');
  });
  it('retains ten summaries and can clear them', () => {
    for (let i = 0; i < 12; i++) beginLocationButtonTrace(() => ({ i }))!.finish('success');
    const api = window.FplacesLocationDiagnostics!;
    expect(api.list()).toHaveLength(10);
    expect(JSON.parse(api.export(api.list()[0].interactionId)).context.i).toBe(2);
    api.clear(); expect(api.export()).toBe('null');
  });
  it('reports mismatches and visibility problems as warnings', () => {
    const trace = beginLocationButtonTrace(() => null)!;
    trace.step('BlueDot', 'comparison', () => ({ matchesExpectedWithin1cm: false, configuredVisible: false }));
    trace.finish('success');
    expect(exported().events[1].level).toBe('warning'); expect(console.warn).toHaveBeenCalled();
  });
  it('records diagnostic read errors and survives console failures', () => {
    vi.mocked(console.log).mockImplementation(() => { throw Error('console unavailable'); });
    const trace = beginLocationButtonTrace(() => { throw Error('SDK read failed'); })!;
    expect(() => trace.step('BlueDot', 'read', () => { throw Error('coordinate read failed'); })).not.toThrow();
    expect(() => trace.finish('failed')).not.toThrow();
    expect(exported().context.diagnosticReadError).toBe('SDK read failed');
  });
  it('never reads coordinates, logs, or installs an API in production', () => {
    vi.stubEnv('DEV', false);
    const read = vi.fn(() => ({ latitude: 6, longitude: 3 }));
    expect(beginLocationButtonTrace(read)).toBeUndefined();
    expect(read).not.toHaveBeenCalled(); expect(window.FplacesLocationDiagnostics).toBeUndefined();
    expect(console.log).not.toHaveBeenCalled(); expect(console.groupCollapsed).not.toHaveBeenCalled();
  });
  it('installs at bootstrap before any venue, route or location-button interaction', async () => {
    installLocationDiagnostics(() => ({ mapStatus: 'loading', route: null }));
    const api = window.FplacesLocationDiagnostics!;
    expect(api.version).toBe(2);
    expect(api.export()).toBe('null');
    const report = JSON.parse(api.exportAll());
    expect(report.runtime).toMatchObject({ development: true, apiVersion: 2 });
    expect(report.currentState).toEqual({ mapStatus: 'loading', route: null });
    expect(report.interactions).toEqual([]);
    expect(report.locationLifecycle).toHaveProperty('events');
    expect(await api.status()).toHaveProperty('serviceWorkers');
  });
  it('exports current venue/navigation state and ongoing lifecycle events beyond the last completed tap', () => {
    let state = { venue: 'one', navigating: false };
    installLocationDiagnostics(() => state);
    const trace = beginLocationButtonTrace(() => state)!;
    expect(JSON.parse(window.FplacesLocationDiagnostics!.exportAll()).inProgress).toHaveLength(1);
    trace.finish('success');
    state = { venue: 'two', navigating: true };
    recordLocationDiagnostic('provider-inactive-after-tap', { accuracy: 35 });
    const report = JSON.parse(window.FplacesLocationDiagnostics!.exportAll());
    expect(report.currentState).toEqual(state);
    expect(report.interactions).toHaveLength(1); expect(report.inProgress).toEqual([]);
    expect(report.interactions[0].context.venue).toBe('one');
    expect(report.locationLifecycle.events).toContainEqual(expect.objectContaining({ event: 'provider-inactive-after-tap', detail: { accuracy: 35 } }));
  });
  it('reports service-worker ownership without updating, unregistering or navigating', async () => {
    const registration = { scope: 'https://localhost/', active: { scriptURL: 'https://localhost/sw.js', state: 'activated' }, update: vi.fn(), unregister: vi.fn() };
    vi.stubGlobal('navigator', { serviceWorker: { controller: registration.active, getRegistrations: vi.fn(async () => [registration]) } });
    installLocationDiagnostics();
    expect(await window.FplacesLocationDiagnostics!.status()).toMatchObject({ serviceWorkerController: 'https://localhost/sw.js', serviceWorkers: [{ scope: 'https://localhost/', activeState: 'activated' }] });
    expect(registration.update).not.toHaveBeenCalled(); expect(registration.unregister).not.toHaveBeenCalled();
  });
  it('does not install at bootstrap or read state in production', () => {
    vi.stubEnv('DEV', false);
    const read = vi.fn(); installLocationDiagnostics(read);
    expect(window.FplacesLocationDiagnostics).toBeUndefined(); expect(read).not.toHaveBeenCalled();
  });

  it('clears the shared diagnostic histories without mutating current positioning state', () => {
    const current = { coordinate: { latitude: 6, longitude: 3 }, providerRunning: true };
    const clearNavigation = vi.fn(), clearPositions = vi.fn();
    (window as any).FplacesNavigationDiagnostics = { clear: clearNavigation, record: vi.fn(), export: () => '{}' };
    (window as any).FplacesPositionDiagnostics = { clear: clearPositions, snapshot: () => ({}) };
    installLocationDiagnostics(() => current);
    beginLocationButtonTrace(() => current)!.finish('success'); recordLocationDiagnostic('watch-timeout');
    window.FplacesLocationDiagnostics!.clearAll();
    const report = JSON.parse(window.FplacesLocationDiagnostics!.exportAll());
    expect(report.interactions).toEqual([]); expect(report.locationLifecycle.events).toEqual([]);
    expect(report.currentState).toEqual(current); expect(current.providerRunning).toBe(true);
    expect(clearNavigation).toHaveBeenCalledOnce(); expect(clearPositions).toHaveBeenCalledOnce();
  });

});
