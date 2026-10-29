import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { MapMarkerService } from '../map/markers';
import { VenueGpsReference } from '../position/domain/venue-gps-reference';
import { FloorOrchestrator } from '../position/debug/floorOrchestrator';
import { initialAppState } from '../types';

const sdk = vi.hoisted(() => ({ current: null as any }));
vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));
vi.mock('@mappedin/blue-dot', () => ({ BlueDot: class {
  isEnabled = false; isFollowing = false; status = 'disabled';
  coordinate: any; floor: any; accuracy: any;
  state: any = {}; listeners = new Map<string, (event: any) => void>();
  constructor() { sdk.current = this; }
  enable = vi.fn((state: any) => { this.isEnabled = true; this.state = { ...this.state, ...state }; this.status = 'hidden'; });
  disable = vi.fn(() => { this.isEnabled = false; this.status = 'disabled'; this.coordinate = undefined; });
  updateState = vi.fn((state: any) => { this.state = { ...this.state, ...state }; });
  getState = () => this.state;
  update = vi.fn((position: any, options?: any) => {
    if (typeof position.latitude !== 'number') return;
    this.coordinate = { latitude: position.latitude, longitude: position.longitude, floorId: position.floorOrFloorId };
    this.floor = position.floorOrFloorId ? { id: position.floorOrFloorId } : undefined;
    this.accuracy = position.accuracy;
    if (!options?.silent) { this.status = 'active'; this.listeners.get('status-change')?.({ status: 'active' }); }
  });
  reportPosition = vi.fn(); watchDevicePosition = vi.fn(); watchDeviceOrientation = vi.fn(async () => {});
  setPositionProcessor = vi.fn();
  Sensors = { get: () => ({ enable: async () => {}, disable: () => {} }) };
  follow = vi.fn((mode: unknown) => { this.isFollowing = !!mode; });
  on = (name: string, listener: (event: any) => void) => { this.listeners.set(name, listener); };
} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('location button → real continuous GPS provider → SDK renderer', () => {
  it.each(['timeout', 'unavailable', 'permission-denied'] as const)('retains a successfully mapped 35m fix on %s, rotates its compass, and recovers', async failure => {
    vi.useFakeTimers();
    let success!: PositionCallback; let fail!: PositionErrorCallback;
    vi.stubGlobal('navigator', { geolocation: { watchPosition: vi.fn((s: PositionCallback, e: PositionErrorCallback) => { success = s; fail = e; return 1; }), clearWatch: vi.fn() } });
    vi.stubGlobal('DeviceOrientationEvent', class {});
    const orientationListeners = new Map<string, (event: any) => void>();
    vi.stubGlobal('window', { addEventListener: (name: string, listener: any) => { if (!orientationListeners.has(name)) orientationListeners.set(name, listener); }, removeEventListener: vi.fn() });
    vi.stubGlobal('document', { querySelector: () => null, getElementById: () => null });
    const state = { ...initialAppState(), locationPermission: 'granted' as const, mapStatus: 'ready' as const, currentFloorId: 'ground', selectedVenueId: '1' };
    const mapView: any = { currentFloor: { id: 'ground' }, Camera: { focusOn: vi.fn() }, createCoordinate: (latitude: number, longitude: number) => ({ latitude, longitude }) };
    mapView.setFloor = vi.fn((id: string) => { mapView.currentFloor = { id }; });
    const service = new MapMarkerService(mapView);
    service.setSimulatorParallelMode(true, { compassGlow: true });
    const reference = new VenueGpsReference();
    reference.anchor({ latitude: 40, longitude: -80, floorId: 'ground' });
    const app = Object.create(MapApp.prototype) as any;
    Object.assign(app, { store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) }, mapView,
      blueDotService: service, venueGpsReference: reference, positionProvider: null,
      floorOrchestrator: new FloorOrchestrator(), resolveNavigationSource: () => 'gps',
      maybeShowContextualProductTour: () => false, ensureLocationEnabledForAction: async () => true,
      locationService: { requestLocation: async () => ({ latitude: 6, longitude: 3, accuracy: 35, timestamp: Date.now() - 114 }) },
      persistLocationChoice: vi.fn(), publishUserLocation: vi.fn(), ingestPositionFrame: vi.fn(), showToast: vi.fn(),
      showLocationGateForRequiredAction: vi.fn(), liveRouteTracking: false });
    service.attachHandlers({ onStatus: status => app.handleBlueDotStatus(status) });
    sdk.current.disable.mockClear();
    try {
      await app.goToMyLocation();
      expect(app.positionProvider.isRunning).toBe(true);
      expect(state.route).toBeNull(); expect(state.markers).toEqual({});
      expect(sdk.current.coordinate).toMatchObject({ latitude: 40, longitude: -80, floorId: 'ground' });
      expect(sdk.current.accuracy).toBe(35);
      const accepted = service.getLocationDiagnosticSnapshot()!.lastPositionReceivedAt;
      fail({ code: failure === 'permission-denied' ? 1 : failure === 'timeout' ? 3 : 2, message: failure } as GeolocationPositionError);
      expect(app.positionProvider.isRunning).toBe(true);
      expect(state.blueDotStatus).toBe(failure === 'permission-denied' ? 'error' : 'inactive');
      expect(service.getLocationDiagnosticSnapshot()).toMatchObject({ positionAvailability: 'retained', lastPositionReceivedAt: accepted,
        floorMatchesView: true, applicationCoordinate: { latitude: 40, longitude: -80, floorId: 'ground' } });
      expect(sdk.current.state.color).toBe('#64748b');
      const retained = { ...sdk.current.coordinate };
      orientationListeners.get('deviceorientation')!({ webkitCompassHeading: 60, webkitCompassAccuracy: 5 });
      orientationListeners.get('deviceorientation')!({ webkitCompassHeading: 60, webkitCompassAccuracy: 5 });
      expect(sdk.current.update).toHaveBeenLastCalledWith({ heading: 60 }, { silent: true, animate: false });
      expect(sdk.current.state.heading).toMatchObject({ visible: true, opacity: .85, displayWhenInactive: true });
      expect(sdk.current.coordinate).toEqual(retained);
      // Stale/coarse watch readings cannot replace the retained point or advance navigation.
      success({ coords: { latitude: 6.01, longitude: 3, accuracy: 200, heading: null }, timestamp: Date.now() } as GeolocationPosition);
      success({ coords: { latitude: 6.01, longitude: 3, accuracy: 5, heading: null }, timestamp: Date.now() - 60_000 } as GeolocationPosition);
      expect(sdk.current.coordinate).toEqual(retained);
      expect(state.routeTraveledMeters).toBe(0); expect(state.routeSimulationComplete).toBe(false);
      success({ coords: { latitude: 6.0001, longitude: 3, accuracy: 5, heading: null }, timestamp: Date.now() } as GeolocationPosition);
      expect(state.blueDotStatus).toBe('active');
      expect(sdk.current.coordinate.latitude).toBeCloseTo(40.0001, 8);
      expect(sdk.current.state.color).toBe('#2266ff');
      expect(sdk.current.disable).not.toHaveBeenCalled();
      expect(service.getLocationDiagnosticSnapshot()?.compass.deviceHeading).toBe(60);
    } finally { app.positionProvider?.stop(); service.stopTracking(); }
  });
});
