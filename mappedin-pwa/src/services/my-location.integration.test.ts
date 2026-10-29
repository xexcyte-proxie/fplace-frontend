import { LocationService } from './location-service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { initialAppState } from '../types';
import { VenueGpsReference } from '../position/domain/venue-gps-reference';
vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
beforeEach(() => {
  vi.stubGlobal('window', {});
  for (const method of ['log', 'warn', 'error', 'table', 'groupCollapsed', 'groupEnd'] as const) vi.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => { window.FplacesLocationDiagnostics?.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const report = () => JSON.parse(window.FplacesLocationDiagnostics!.export());
function harness() {
  const state = initialAppState();
  const app = Object.create(MapApp.prototype) as any;
  const service = { enableHeading: vi.fn(async () => {}), showLivePosition: vi.fn(), isTracking: true, follow: vi.fn(), focusOnUser: vi.fn(), stopFollow: vi.fn() };
  Object.assign(app, { mapView: {}, blueDotService: service,
    store: { get: () => state, patch: (p: object) => Object.assign(state, p) },
    maybeShowContextualProductTour: () => false, ensureLocationEnabledForAction: async () => true,
    locationService: { requestLocation: vi.fn(async () => ({ latitude: 6, longitude: 3, accuracy: 5, timestamp: Date.now() })) },
    persistLocationChoice: vi.fn(), publishUserLocation: vi.fn(), isAwayFromSelectedVenue: vi.fn(() => false),
    showToast: vi.fn(), showLocationGateForRequiredAction: vi.fn() });
  app.startPositionProvider = vi.fn();
  return { app, service, state };
}
describe('My Location', () => {
  it('obtains a fresh fix before evaluating venue distance and centers it', async () => {
    const { app, service } = harness();
    await app.goToMyLocation();
    expect(app.locationService.requestLocation).toHaveBeenCalledOnce();
    expect(app.publishUserLocation.mock.invocationCallOrder[0]).toBeLessThan(app.isAwayFromSelectedVenue.mock.invocationCallOrder[0]);
    expect(service.showLivePosition).toHaveBeenCalledWith(expect.objectContaining({ latitude: 6, longitude: 3 }), { follow: true });
    expect(app.showToast).toHaveBeenCalledWith(expect.stringContaining('6.00000, 3.00000'));
  });
  it('ignores a request completed after the map is replaced', async () => {
    const { app, service } = harness();
    app.locationService.requestLocation.mockImplementation(async () => { app.mapView = {}; return { latitude: 6, longitude: 3 }; });
    await app.goToMyLocation();
    expect(service.showLivePosition).not.toHaveBeenCalled();
  });
  it('labels venue simulation explicitly', async () => {
    const { app } = harness();
    app.venueGpsReference = new VenueGpsReference();
    app.venueGpsReference.anchor({ latitude: 40, longitude: -80 });
    await app.goToMyLocation();
    expect(app.showToast).toHaveBeenCalledWith(expect.stringContaining('Development simulated position'));
  });
  it('initializes and centers simulation from map geometry without route points', async () => {
    const { app, service, state } = harness();
    app.venueGpsReference = new VenueGpsReference();
    app.mapView.currentFloor = { id: 'ground' };
    app.mapData = { getByType: (type: string) => type === 'space' ? [{ id: 'room', name: 'Room',
      center: { latitude: 40, longitude: -80 }, floor: { id: 'ground' } }] : [] };
    expect(state.route).toBeNull(); expect(state.markers).toEqual({});
    await app.goToMyLocation();
    expect(service.showLivePosition).toHaveBeenCalledWith(expect.objectContaining({ latitude: 40, longitude: -80, floorId: 'ground' }), { follow: true });
    expect(app.startPositionProvider).toHaveBeenCalledWith([]);
    expect(app.venueGpsReference.diagnosticSnapshot()).toMatchObject({ mapAnchorInfo: { source: 'mapped-space', objectId: 'room' } });
    expect(state.route).toBeNull(); expect(state.markers).toEqual({});
    expect(app.showLocationGateForRequiredAction).not.toHaveBeenCalled();
    const reference = app.venueGpsReference;
    state.route = { pathCoordinates: [{ latitude: 41, longitude: -81, floorId: 'ground' }] } as any;
    const routeBefore = JSON.stringify(state.route);
    app.locationService.requestLocation.mockResolvedValue({ latitude: 6.0001, longitude: 3, accuracy: 5, timestamp: Date.now() });
    await app.goToMyLocation();
    expect(app.venueGpsReference).toBe(reference);
    expect(service.showLivePosition.mock.calls.at(-1)?.[0].latitude).toBeCloseTo(40.0001, 8);
    expect(reference.diagnosticSnapshot().mapAnchor).toMatchObject({ latitude: 40, longitude: -80 });
    expect(JSON.stringify(state.route)).toBe(routeBefore);
  });
  it('explains missing map geometry without asking for route selection', async () => {
    const { app, service } = harness();
    app.venueGpsReference = new VenueGpsReference();
    app.mapData = { getByType: () => [] };
    await app.goToMyLocation();
    expect(service.showLivePosition).not.toHaveBeenCalled();
    expect(app.showToast).toHaveBeenCalledWith(expect.stringContaining('could not find a mapped reference'));
    expect(app.startPositionProvider).not.toHaveBeenCalled();
  });

  it('traces real GPS timestamp, nonzero transform, SDK comparison and route-free centering', async () => {
    const { app, service, state } = harness();
    state.selectedVenueId = '1'; state.locationPermission = 'granted';
    state.forumVenues = [{ id: 1, name: 'Test venue', latitude: 43, longitude: -79 }] as any;
    const position = { coords: { latitude: 6.0001, longitude: 3.0002, accuracy: 7, speed: 0, heading: null }, timestamp: Date.now() - 500 } as GeolocationPosition;
    app.locationService = new LocationService();
    vi.spyOn(app.locationService, 'getCurrentPosition').mockResolvedValue(position);
    app.venueGpsReference = new VenueGpsReference();
    app.venueGpsReference.capture({ latitude: 6, longitude: 3 });
    app.venueGpsReference.anchor({ latitude: 40, longitude: -80 }, { source: 'mapped-space', objectId: 'room', name: 'Room' });
    const expected = app.venueGpsReference.translate({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    const renderer = service as any;
    renderer.getLocationDiagnosticSnapshot = vi.fn(() => ({ sdkCoordinate: renderer.coordinate ?? null, configuredVisible: true,
      enabled: true, matchesExpectedWithin1cm: renderer.coordinate ? true : null, visibilityEvidence: 'SDK state only' }));
    service.showLivePosition.mockImplementation((input: any) => { renderer.coordinate = input; });
    await app.goToMyLocation();
    const result = report();
    expect(result.outcome).toBe('success');
    expect(result.context.selectedVenue).toMatchObject({ id: '1', name: 'Test venue', originalGeographicCoordinates: { latitude: 43, longitude: -79 } });
    const gps = result.events.find((event: any) => event.message === 'Device GPS response').values;
    expect(gps).toMatchObject({ latitude: 6.0001, longitude: 3.0002, accuracyMeters: 7, timestamp: position.timestamp });
    const transform = result.events.find((event: any) => event.message === 'Physical-to-map coordinate transformation').values;
    expect(transform.localOffsetMeters.east).toBeGreaterThan(20);
    expect(transform.localOffsetMeters.north).toBeGreaterThan(11);
    expect(transform.simulatedOutput).toMatchObject(expected);
    expect(transform.inversePhysicalCheck.latitude).toBeCloseTo(position.coords.latitude, 10);
    expect(transform).toMatchObject({ routeUsedAsAnchor: false, determinedWithoutRoute: true, anchor: { objectId: 'room' } });
    const final = result.events.find((event: any) => event.message === 'Final comparison against calculated location').values;
    expect(final).toMatchObject({ sdkCoordinate: expected, configuredVisible: true, matchesExpectedWithin1cm: true });
    expect(result.finalState.routeDependency.routePresent).toBe(false);
    expect(service.follow).toHaveBeenCalledOnce(); expect(service.focusOnUser).toHaveBeenCalledOnce();
  });
  it.each(['map-not-ready', 'permission-action-required', 'failed'])('exports a complete outcome for %s', async outcome => {
    const { app } = harness();
    if (outcome === 'map-not-ready') app.mapView = null;
    if (outcome === 'permission-action-required') app.ensureLocationEnabledForAction = async () => false;
    if (outcome === 'failed') app.locationService.requestLocation.mockRejectedValue({ code: 1, message: 'Permission denied' });
    await app.goToMyLocation();
    expect(report().outcome).toBe(outcome);
    if (outcome === 'failed') expect(report().events.find((event: any) => event.level === 'error').values.error).toMatchObject({ code: 1 });
  });
  it('keeps location behavior when SDK diagnostic access throws', async () => {
    const { app, service } = harness();
    (service as any).getLocationDiagnosticSnapshot = () => { throw Error('read failed'); };
    await app.goToMyLocation();
    expect(service.showLivePosition).toHaveBeenCalledOnce();
    expect(app.showLocationGateForRequiredAction).not.toHaveBeenCalled();
    expect(report().outcome).toBe('success');
  });
  it('does not create console reports or read SDK diagnostics in production', async () => {
    const { app, service } = harness();
    const snapshot = vi.fn(); (service as any).getLocationDiagnosticSnapshot = snapshot;
    vi.stubEnv('DEV', false);
    await app.goToMyLocation();
    expect(app.locationService.requestLocation).toHaveBeenCalledWith({ timeoutMs: 15000 });
    expect(service.showLivePosition).toHaveBeenCalledOnce(); expect(snapshot).not.toHaveBeenCalled();
    expect(window.FplacesLocationDiagnostics).toBeUndefined();
    expect(console.groupCollapsed).not.toHaveBeenCalled();
  });

  it('starts the compass during the location tap before permission or GPS awaits', async () => {
    const { app, service } = harness();
    let resolvePermission!: (granted: boolean) => void;
    app.ensureLocationEnabledForAction = () => new Promise(resolve => { resolvePermission = resolve; });
    const action = app.goToMyLocation();
    expect(service.enableHeading).toHaveBeenCalledWith({ forceDuringSimulator: true });
    expect(app.locationService.requestLocation).not.toHaveBeenCalled();
    resolvePermission(true); await action;
    expect(service.showLivePosition).toHaveBeenCalledOnce();
  });

  it('does not overwrite a continuous-watch failure reported during button initialization', async () => {
    const { app, service, state } = harness();
    state.locationPermission = 'granted';
    app.venueGpsReference = new VenueGpsReference();
    app.venueGpsReference.anchor({ latitude: 40, longitude: -80 });
    service.isTracking = false;
    (service as any).startTracking = vi.fn(async () => {});
    (service as any).setPositionAvailability = vi.fn();
    app.showToast = vi.fn();
    app.startPositionProvider = vi.fn(() => app.handleLivePositionStatus('inactive'));
    await app.goToMyLocation();
    expect(service.showLivePosition).toHaveBeenCalledOnce();
    expect(state.blueDotStatus).toBe('inactive');
    expect((service as any).setPositionAvailability).toHaveBeenLastCalledWith('retained');
  });
  it.each([{ accuracy: 200 }, { timestamp: Date.now() - 60_000 }])('retains the last position instead of rendering unusable button data %j', async patch => {
    const { app, service, state } = harness();
    state.locationPermission = 'granted';
    app.locationService.requestLocation.mockResolvedValue({ latitude: 6, longitude: 3, accuracy: 5, timestamp: Date.now(), ...patch });
    await app.goToMyLocation();
    expect(service.showLivePosition).not.toHaveBeenCalled();
    expect(state.blueDotStatus).toBe('inactive');
    expect(report().outcome).toBe('unusable-display-fix');
  });
  it('centers the established simulation floor when another floor is being browsed', async () => {
    const { app, service, state } = harness();
    app.venueGpsReference = new VenueGpsReference();
    app.venueGpsReference.anchor({ latitude: 40, longitude: -80, floorId: 'ground' });
    app.mapView.currentFloor = { id: 'upper' };
    app.mapView.setFloor = vi.fn();
    await app.goToMyLocation();
    expect(app.mapView.setFloor).toHaveBeenCalledWith('ground');
    expect(state.currentFloorId).toBe('ground');
    expect(service.showLivePosition).toHaveBeenCalledWith(expect.objectContaining({ floorId: 'ground' }), { follow: true });
  });

  it('restarts a failed continuous provider after a successful explicit location retry', async () => {
    const { app, state } = harness(); state.blueDotStatus = 'error';
    app.positionProvider = { isRunning: true };
    app.venueGpsReference = new VenueGpsReference(); app.venueGpsReference.anchor({ latitude: 40, longitude: -80 });
    await app.goToMyLocation();
    expect(app.startPositionProvider).toHaveBeenCalledWith([]);
  });

});
