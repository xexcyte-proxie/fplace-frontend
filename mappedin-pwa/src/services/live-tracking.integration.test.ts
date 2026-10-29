import { describe, expect, it, vi } from 'vitest';
import { PositionProviderRegistry } from '../position/providerRegistry';
import { MapApp } from './map-app';
import { VenueGpsReference } from '../position/domain/venue-gps-reference';
import { dispatchPositionToAr, isArFrameVisible, syncNavigationToAr } from './ar-service';
import { appConfig } from '../config';
import { initialAppState } from '../types';
import { LiveAlongPathStabilizer } from '../routing/route-progress';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: vi.fn(() => false), dispatchPositionToAr: vi.fn(), syncNavigationToAr: vi.fn() }));

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
    blueDotService: { applySimulatorFrame: vi.fn(), applyHeadingOnly: vi.fn(), getLastPosition: vi.fn() },
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
  it('shares the translated position with AR', () => {
    const { app, state } = harness();
    app.venueGpsReference = new VenueGpsReference();
    app.venueGpsReference.capture({ latitude: 43, longitude: -80 });
    app.venueGpsReference.anchor(state.route!.pathCoordinates[0]);
    state.routeSimulating = false;
    app.liveRouteTracking = false;
    app.lastArProviderStreamAt = -Infinity;
    vi.mocked(isArFrameVisible).mockReturnValue(true);
    try {
      app.handleProviderFrame({ latitude: 43.0001, longitude: -80, accuracy: 5, timestamp: Date.now(), source: 'gps' });
      expect(dispatchPositionToAr).toHaveBeenCalledWith(app.blueDotService.applySimulatorFrame.mock.calls[0][0]);
    } finally {
      vi.mocked(isArFrameVisible).mockReturnValue(false);
    }
  });
  it('captures once per selected venue and ignores a late capture from the previous venue', async () => {
    const { app, state } = harness();
    const enabled = appConfig.positioning.enableVenueGeolocationSimulation;
    appConfig.positioning.enableVenueGeolocationSimulation = true;
    let firstResolve: (value: any) => void = () => {};
    app.locationService = { getCurrentPosition: vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { firstResolve = resolve; }))
      .mockResolvedValue({ coords: { latitude: 10, longitude: 20, accuracy: 5 }, timestamp: Date.now() }) };
    app.blueDotService.setSimulatorParallelMode = vi.fn();
    app.publishUserLocation = vi.fn();
    try {
      state.selectedVenueId = '1';
      app.initializeVenueGpsReference();
      app.initializeVenueGpsReference();
      expect(app.locationService.getCurrentPosition).toHaveBeenCalledTimes(1);
      state.selectedVenueId = '2';
      app.initializeVenueGpsReference();
      await Promise.resolve();
      firstResolve({ coords: { latitude: 40, longitude: 50, accuracy: 5 }, timestamp: Date.now() });
      await Promise.resolve();
      app.venueGpsReference.anchor({ latitude: 0, longitude: 0 });
      expect(app.venueGpsReference.translate({ latitude: 10, longitude: 20 })).toEqual({ latitude: 0, longitude: 0 });
      expect(app.locationService.getCurrentPosition).toHaveBeenCalledTimes(2);
    } finally {
      appConfig.positioning.enableVenueGeolocationSimulation = enabled;
    }
  });
  it('translates physical GPS before route progress and preserves physical coordinates for user location', () => {
    const { app, state } = harness();
    const reference = new VenueGpsReference();
    reference.capture({ latitude: 43, longitude: -80 });
    reference.anchor(state.route!.pathCoordinates[0]);
    app.venueGpsReference = reference;
    app.publishUserLocation = vi.fn();
    const geometry = JSON.stringify(state.route!.pathCoordinates);
    app.handleProviderFrame({ latitude: 43.0001, longitude: -80, accuracy: 5, timestamp: Date.now(), source: 'gps', floorId: 'ground' });
    expect(app.blueDotService.applySimulatorFrame).toHaveBeenCalledOnce();
    expect(app.blueDotService.applySimulatorFrame.mock.calls[0][0].latitude).toBeCloseTo(6.6001, 5);
    expect(app.ingestPositionFrame).toHaveBeenCalledWith(app.blueDotService.applySimulatorFrame.mock.calls[0][0]);
    expect(app.publishUserLocation).toHaveBeenCalledWith({ latitude: 43.0001, longitude: -80, accuracy: 5 });
    expect(JSON.stringify(state.route!.pathCoordinates)).toBe(geometry);
  });
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
  it('renders a fresh 35m simulated fix without advancing navigation or AR', () => {
    const { app, state } = harness();
    app.venueGpsReference = new VenueGpsReference();
    app.venueGpsReference.capture({ latitude: 43, longitude: -80 });
    app.venueGpsReference.anchor(state.route!.pathCoordinates[0]);
    app.blueDotService.setPositionAvailability = vi.fn();
    const syncProgress = vi.spyOn(app, 'syncLiveRouteProgress');
    app.handleProviderFrame({ latitude: 43.0008, longitude: -80, accuracy: 35, timestamp: Date.now() - 114, source: 'gps' });
    expect(app.blueDotService.applySimulatorFrame).toHaveBeenCalledWith(expect.objectContaining({ latitude: expect.closeTo(6.6008, 5), accuracy: 35 }));
    expect(app.blueDotService.setPositionAvailability).toHaveBeenCalledWith('approximate');
    expect(state.blueDotStatus).toBe('inactive');
    expect(state.routeTraveledMeters).toBe(0); expect(state.routeRemainingMeters).toBe(100);
    expect(state.routeSimulationComplete).toBe(false); expect(syncProgress).not.toHaveBeenCalled();
    expect(app.ingestPositionFrame).not.toHaveBeenCalled();
    expect(app.providerPositionFilter).toBeUndefined();
    app.blueDotService.getLastPosition.mockReturnValue({ coordinate: { latitude: 6.6008, longitude: 3.35 }, accuracy: 35 });
    expect(app.getNavigationProgressSnapshot()).toMatchObject({ latitude: 6.6, longitude: 3.35, routeTraveledMeters: 0 });
  });
  it('allows compass-only updates after a GPS interruption without restoring positioning or progress', () => {
    const { app, state } = harness(); state.blueDotStatus = 'inactive';
    app.handleProviderFrame({ latitude: 6.6009, longitude: 3.35, accuracy: 5, timestamp: Date.now() - 60_000, source: 'gps', headingOnly: true, heading: 90 });
    expect(app.blueDotService.applyHeadingOnly).toHaveBeenCalledWith(90);
    expect(app.blueDotService.applySimulatorFrame).not.toHaveBeenCalled();
    expect(state.blueDotStatus).toBe('inactive'); expect(state.routeTraveledMeters).toBe(0);
    expect(app.ingestPositionFrame).not.toHaveBeenCalled();
  });
  it('shares a compass turn with AR using unchanged route progress and trusted coordinates', () => {
    const { app, state } = harness(); state.blueDotStatus = 'inactive';
    app.lastArProviderStreamAt = -Infinity;
    app.blueDotService.getLastPosition.mockReturnValue({ coordinate: { latitude: 6.6008, longitude: 3.35 }, heading: 90 });
    vi.mocked(syncNavigationToAr).mockClear();
    vi.mocked(isArFrameVisible).mockReturnValue(true);
    try {
      app.handleProviderFrame({ latitude: 43, longitude: -80, accuracy: 35, timestamp: Date.now() - 60_000, source: 'gps', headingOnly: true, heading: 90 });
      expect(syncNavigationToAr).toHaveBeenCalledWith(expect.objectContaining({ latitude: 6.6, longitude: 3.35, heading: 90, alongPathMeters: 0 }));
      expect(state.blueDotStatus).toBe('inactive'); expect(state.routeTraveledMeters).toBe(0);
      expect(app.blueDotService.applySimulatorFrame).not.toHaveBeenCalled();
    } finally { vi.mocked(isArFrameVisible).mockReturnValue(false); }
  });
  it('recovers on a usable fix without reusing a rejected snap', () => {
    const { app, state } = harness();
    app.handleProviderFrame({ latitude: 43, longitude: -80, accuracy: 5, timestamp: Date.now() - 1000, source: 'gps' });
    app.handleProviderFrame({ latitude: 6.60001, longitude: 3.35, accuracy: 5, timestamp: Date.now(), source: 'gps' });
    expect(state.blueDotStatus).toBe('active');
    expect(app.blueDotService.applySimulatorFrame).toHaveBeenCalledOnce();
    expect(state.routeSimulationComplete).toBe(false);
  });
});

describe('arrival precision', () => {
  it('rejects arrival from snapped progress alone or an unconfirmed AR message', () => {
    const { app, state } = harness();
    state.routeTraveledMeters = 100;
    app.alongPathStabilizer.reset(100);
    app.syncLiveRouteProgress(100, { offRouteMeters: 0, accuracyMeters: 5, destinationDistanceM: 12 });
    expect(state.routeSimulationComplete).toBe(false);
    app.lockNavigationArrival();
    expect(state.routeSimulationComplete).toBe(false);
    expect(state.arrivalDialogOpen).toBe(false);
  });
  it('waits for an accurate fresh fix before confirming arrival', () => {
    const { app, state } = harness();
    state.routeTraveledMeters = 100;
    app.alongPathStabilizer.reset(100);
    app.syncLiveRouteProgress(100, { offRouteMeters: 0, accuracyMeters: 25 });
    expect(state.routeSimulationComplete).toBe(false);
    app.syncLiveRouteProgress(100, { offRouteMeters: 0, accuracyMeters: 5, destinationDistanceM: 0 });
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


describe('shared provider stabilization', () => {
  it('holds stationary jitter across route initialization, but accepts walking', () => {
    const { app, state } = harness();
    app.liveRouteTracking = false;
    state.routeSimulating = false;
    const fix = { latitude: 6.6001, longitude: 3.35, accuracy: 5, timestamp: Date.now() - 4000, source: 'gps' };
    app.handleProviderFrame(fix);
    const first = app.blueDotService.applySimulatorFrame.mock.calls.at(-1)[0];
    app.handleProviderFrame({ ...fix, latitude: fix.latitude + 0.000004, timestamp: fix.timestamp + 1 });
    expect(app.blueDotService.applySimulatorFrame.mock.calls.at(-1)[0].latitude).toBe(first.latitude);
    app.handleProviderFrame({ ...fix, latitude: fix.latitude + 0.00003, timestamp: fix.timestamp + 2000 });
    expect(app.blueDotService.applySimulatorFrame.mock.calls.at(-1)[0].latitude).toBe(first.latitude);
    app.handleProviderFrame({ ...fix, latitude: fix.latitude + 0.000035, timestamp: fix.timestamp + 3000 });
    expect(app.blueDotService.applySimulatorFrame.mock.calls.at(-1)[0].latitude).toBeGreaterThan(first.latitude);
    expect(state.routeSimulationComplete).toBe(false);
  });
});
