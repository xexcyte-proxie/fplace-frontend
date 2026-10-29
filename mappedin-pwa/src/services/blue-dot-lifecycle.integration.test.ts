import { appConfig } from '../config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { initialAppState } from '../types';
import { getLocationDiagnosticReport } from '../location/domain/location-diagnostics';
import { VenueGpsReference } from '../position/domain/venue-gps-reference';
vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function harness() {
  const state = { ...initialAppState(), locationPermission: 'granted', mapStatus: 'ready' };
  const service: any = { startTracking: vi.fn(async () => {}), applySimulatorFrame: vi.fn() };
  const app = Object.create(MapApp.prototype) as any;
  Object.assign(app, { store: { get: () => state, patch: (p: any) => Object.assign(state,p) },
    blueDotService: service, mapView: {}, mapLoadGeneration: 1, positionProvider: null,
    startPositionProvider: vi.fn(), stopPositionProvider: vi.fn(), handleLivePositionStatus: vi.fn() });
  return { app, state, service };
}
describe('blue dot map/permission/provider lifecycle', () => {
  it.each(['missing', 'rejecting'])('starts after a successful grant when Permissions API is %s', async mode => {
    vi.stubGlobal('navigator', mode === 'missing' ? {} : { permissions: { query: vi.fn().mockRejectedValue(Error('unsupported')) } });
    const { app, service } = harness(); await app.maybeAutoStartBlueDot(); expect(service.startTracking).toHaveBeenCalledOnce();
  });
  it('does not start on explicit browser denial or an ungranted app permission', async () => {
    vi.stubGlobal('navigator', { permissions: { query: vi.fn().mockResolvedValue({ state: 'denied' }) } });
    const { app, state, service } = harness(); await app.maybeAutoStartBlueDot(); expect(service.startTracking).not.toHaveBeenCalled();
    expect(getLocationDiagnosticReport()).toContain('browser-geolocation-denied');
    state.locationPermission = 'prompt'; await app.maybeAutoStartBlueDot(); expect(service.startTracking).not.toHaveBeenCalled();
  });
  it.each(['replacement-map', 'navigation-provider'])('ignores late permission completion after %s takes over', async change => {
    let resolve!: (value: any) => void;
    vi.stubGlobal('navigator', { permissions: { query: () => new Promise(r => { resolve=r; }) } });
    const { app, service } = harness(); const start=app.maybeAutoStartBlueDot();
    if (change === 'replacement-map') { app.mapLoadGeneration++; app.blueDotService={ startTracking:vi.fn() }; }
    else app.positionProvider={ isRunning:true };
    resolve({ state:'granted' }); await start; expect(service.startTracking).not.toHaveBeenCalled();
  });
  it('starts the shared GPS provider in simulation even without a route, without injecting a position', async () => {
    vi.stubGlobal('navigator', {});
    const { app, service }=harness(); app.venueGpsReference=new VenueGpsReference();
    await app.maybeAutoStartBlueDot(); expect(app.startPositionProvider).toHaveBeenCalledWith([]);
    expect(service.startTracking).not.toHaveBeenCalled(); expect(service.applySimulatorFrame).not.toHaveBeenCalled();
  });
  it('withholds an actual GPS fix until simulation has an explicit map anchor, and logs why', () => {
    const { app, service }=harness(); app.venueGpsReference=new VenueGpsReference();
    app.handleProviderFrame({ latitude:6, longitude:3, accuracy:5, timestamp:Date.now(), source:'gps' });
    expect(service.applySimulatorFrame).not.toHaveBeenCalled();
    expect(getLocationDiagnosticReport()).toContain('simulation-map-anchor-unavailable');
    expect(app.venueGpsReference.translate({ latitude:6, longitude:3 })).toBeNull();
  });
  it('restores idle tracking after clearing navigation', async () => {
    vi.stubGlobal('navigator', {});
    const { app, service }=harness();
    app.routePlanner={ clearRoute:vi.fn(), endGuidedNavigation:vi.fn(), setRoutePlanningPaused:vi.fn() };
    app.alongPathStabilizer={ reset:vi.fn() };
    await app.clearRoute(); expect(app.stopPositionProvider).toHaveBeenCalledOnce(); expect(service.startTracking).toHaveBeenCalledOnce();
  });
  it('renders the first venue-opening GPS fix and walking before any route exists', async () => {
    const { app, service, state } = harness();
    const enabled = appConfig.positioning.enableVenueGeolocationSimulation;
    appConfig.positioning.enableVenueGeolocationSimulation = true;
    try {
      state.selectedVenueId = '1';
      state.currentFloorId = 'ground';
      const space = Object.freeze({ id: 'room', name: 'Room', floor: { id: 'ground' }, center: Object.freeze({ latitude: 40, longitude: -80 }) });
      app.mapData = { getByType: (type: string) => type === 'space' ? [space] : [] };
      app.mapView.currentFloor = { id: 'ground' };
      service.setSimulatorParallelMode = vi.fn();
      app.ingestPositionFrame = vi.fn(); app.publishUserLocation = vi.fn();
      const timestamp = Date.now();
      app.locationService = { getCurrentPosition: vi.fn(async () => ({ coords: { latitude: 6, longitude: 3, accuracy: 5 }, timestamp })) };
      app.initializeVenueGpsReference();
      await Promise.resolve(); await Promise.resolve();
      expect(state.route).toBeNull(); expect(state.markers).toEqual({});
      expect(service.applySimulatorFrame).toHaveBeenCalledWith(expect.objectContaining({ latitude: 40, longitude: -80, floorId: 'ground', accuracy: 5 }));
      app.handleProviderFrame({ latitude: 6.0001, longitude: 3, accuracy: 5, timestamp: timestamp + 1, source: 'gps' });
      expect(service.applySimulatorFrame.mock.calls.at(-1)[0].latitude).toBeCloseTo(40.0001, 8);
      expect(app.publishUserLocation).toHaveBeenLastCalledWith({ latitude: 6.0001, longitude: 3, accuracy: 5 });
      const reference = app.venueGpsReference;
      app.initializeVenueGpsReference();
      expect(app.venueGpsReference).toBe(reference);
      app.resolveVenueSelection = () => ({ forumVenue: { id: 1, name: 'Venue' } });
      app.openNavigateMap = vi.fn(); app.showToast = vi.fn();
      await app.openHomeVenue('1');
      expect(app.venueGpsReference).toBe(reference);
      expect(app.locationService.getCurrentPosition).toHaveBeenCalledOnce();
      expect(space.center).toEqual({ latitude: 40, longitude: -80 });
      expect(reference.diagnosticSnapshot()).toMatchObject({ mapAnchorInfo: { objectId: 'room', source: 'mapped-space' } });
    } finally { appConfig.positioning.enableVenueGeolocationSimulation = enabled; }
  });

});
