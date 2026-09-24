import { describe, expect, it, vi } from 'vitest';
import { PositionProviderRegistry } from '../position/providerRegistry';
import { MapApp } from './map-app';
import { initialAppState } from '../types';
import { LiveAlongPathStabilizer } from '../routing/route-progress';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));

function harness() {
  const state = initialAppState();
  state.locationPermission = 'granted';
  state.routeSimulating = true;
  state.route = {
    distanceMeters: 100,
    pathCoordinates: [
      { latitude: 6.6, longitude: 3.35, floorId: 'ground' },
      { latitude: 6.6009, longitude: 3.35, floorId: 'ground' },
    ],
  } as any;
  state.routeRemainingMeters = 100;
  const app = Object.create(MapApp.prototype) as any;
  Object.assign(app, {
    store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) },
    blueDotService: { applySimulatorFrame: vi.fn(), applyHeadingOnly: vi.fn() },
    routePlanner: { updateTravelledPath: vi.fn(), updateDestinationProximity: vi.fn() },
    liveRouteTracking: true,
    alongPathStabilizer: new LiveAlongPathStabilizer(),
    lastAlongPublishAt: 0,
    showToast: vi.fn(),
    ingestPositionFrame: vi.fn(),
    lastProviderFix: null,
  });
  app.alongPathStabilizer.reset(0);
  return { app, state };
}

describe('live map navigation integration', () => {
  it.each([
    { latitude: 43.463333, longitude: -80.523135 },
    { accuracy: 200 },
    { timestamp: Date.now() - 60_000 },
  ])('does not move marker or progress for an unusable fix %j', patch => {
    const { app, state } = harness();
    app.handleProviderFrame({ latitude: 6.6005, longitude: 3.35, accuracy: 5, timestamp: Date.now(), source: 'gps', ...patch });
    expect(app.blueDotService.applySimulatorFrame).not.toHaveBeenCalled();
    expect(state.routeRemainingMeters).toBe(100);
    expect(state.routeTraveledMeters).toBe(0);
    expect(state.routeSimulationComplete).toBe(false);
    expect(state.blueDotStatus).toBe('inactive');
  });
  it('recovers on a usable fix without reusing a rejected snap', () => {
    const { app, state } = harness();
    app.handleProviderFrame({ latitude: 43, longitude: -80, accuracy: 5, timestamp: Date.now(), source: 'gps' });
    app.handleProviderFrame({ latitude: 6.60001, longitude: 3.35, accuracy: 5, timestamp: Date.now(), source: 'gps' });
    expect(state.blueDotStatus).toBe('active');
    expect(app.blueDotService.applySimulatorFrame).toHaveBeenCalledOnce();
    expect(state.routeSimulationComplete).toBe(false);
  });
});

describe('arrival precision', () => {
  it('waits for an accurate fresh fix before confirming arrival', () => {
    const { app, state } = harness();
    state.routeTraveledMeters = 100;
    app.alongPathStabilizer.reset(100);
    app.syncLiveRouteProgress(100, { offRouteMeters: 0, accuracyMeters: 25 });
    expect(state.routeSimulationComplete).toBe(false);
    app.syncLiveRouteProgress(100, { offRouteMeters: 0, accuracyMeters: 5 });
    expect(state.routeSimulationComplete).toBe(true);
    expect(state.arrivalDialogOpen).toBe(true);
  });
});


describe('loaded venue wiring', () => {
  it('passes the loaded map identity into provider selection and startup', () => {
    const { app, state } = harness();
    app.loadedVenueMapId = 'ltv-8-loaded-map';
    app.stopPositionProvider = vi.fn();
    app.floorOrchestrator = { reset: vi.fn(), getState: vi.fn(), forceFloor: vi.fn() };
    app.applyOrchestratedFloor = vi.fn();
    app.blueDotService.setSimulatorParallelMode = vi.fn();
    const start = vi.fn();
    const select = vi.spyOn(PositionProviderRegistry, 'resolveNavigationSource').mockReturnValue('gps');
    const get = vi.spyOn(PositionProviderRegistry, 'getProvider').mockReturnValue({ start } as any);
    try {
      app.startPositionProvider(state.route!.pathCoordinates);
      expect(select).toHaveBeenCalledWith('ltv-8-loaded-map');
      expect(start).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ venueMapId: 'ltv-8-loaded-map' }));
    } finally {
      select.mockRestore();
      get.mockRestore();
    }
  });
});
