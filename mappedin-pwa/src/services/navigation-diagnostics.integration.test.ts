import { describe, expect, it, vi } from 'vitest';
const recorder = vi.hoisted(() => ({ frozen: false, cause: null as number | null, accept: vi.fn((frame: any) => frame), distance: (a: any,b: any) => Math.hypot(a.latitude-b.latitude,a.longitude-b.longitude)*111195, record: vi.fn(() => 12), update: vi.fn(), metadata: vi.fn() }));
vi.mock('../position/debug/navigation-diagnostics', () => ({ navigationDiagnostics: recorder }));
vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));
import { MapApp } from './map-app';
import { initialAppState } from '../types';

describe('stationary diagnostic integration', () => {
  it('projects the frozen coordinates, continues observing raw GPS, and suppresses external location publication', () => {
    const state = initialAppState();
    const app = Object.create(MapApp.prototype) as any;
    const projectedInputs: any[] = [];
    Object.assign(app, { store: { get: () => state, patch: (p: any) => Object.assign(state,p) },
      projectFrameOntoRoute: (frame: any) => { projectedInputs.push(frame); return frame; },
      blueDotService: { applySimulatorFrame: vi.fn() }, ingestPositionFrame: vi.fn(), publishUserLocation: vi.fn(),
      getNavigationProgressSnapshot: () => ({}), lastProviderFix: null, liveRouteTracking: false });
    const raw = { latitude: 6.001, longitude: 3, accuracy: 5, timestamp: Date.now(), source: 'gps' };
    recorder.frozen = true; recorder.accept.mockImplementation(frame => ({ ...frame, latitude: 6 }));
    app.handleProviderFrame(raw);
    expect(projectedInputs[0].latitude).toBe(6); expect(raw.latitude).toBe(6.001);
    expect(app.publishUserLocation).not.toHaveBeenCalled();
    expect(recorder.update).toHaveBeenCalledWith('position', 'MapApp.handleProviderFrame', expect.objectContaining({ raw, frozen: true }));
    expect(recorder.cause).toBeNull();
    recorder.frozen = false; recorder.accept.mockImplementation(frame => frame);
    app.handleProviderFrame({ ...raw, latitude: 6.002, timestamp: raw.timestamp + 1 }); expect(app.publishUserLocation).toHaveBeenCalledOnce();
  });
});
