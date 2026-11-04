import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { initialAppState } from '../types';
vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
const controls = vi.hoisted(() => ({ start: null as null | (() => void), mount: vi.fn(), remove: vi.fn() }));
vi.mock('../position/physical-walk/controls', () => ({ mountPhysicalWalkControls: (...args: any[]) => {
  controls.mount(); controls.start = args[1]; return controls.remove;
} }));
function harness() {
  const state = initialAppState();
  state.route = { pathCoordinates: [{ latitude: 43, longitude: -80, floorId: 'g' }, { latitude: 43.001, longitude: -80, floorId: 'g' }], distanceMeters: 111 } as any;
  state.userLocation = { latitude: 6.5, longitude: 3.4, accuracy: 5 };
  const app = Object.create(MapApp.prototype) as any;
  const normalStart = vi.fn(); const stop = vi.fn();
  Object.assign(app, { store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) },
    physicalWalk: null, removePhysicalWalkControls: null, loadedVenueMapId: 'remote-map',
    blueDotService: { setPositionDiagnostics: vi.fn(), setHeadingDiagnostics: vi.fn(), setSimulatorParallelMode: vi.fn(), follow: vi.fn(), applyProviderFrame: vi.fn(), getLastPosition: vi.fn() },
    mapView: { setFloor: vi.fn() }, routePlanner: { clearTravelledPathTracking: vi.fn(), updateTravelledPath: vi.fn() },
    stopPositionProvider: stop, startPositionProvider: normalStart, showToast: vi.fn(), isArOpen: () => false,
    ingestPositionFrame: vi.fn(), lastProviderFix: null });
  return { app, state, normalStart, stop };
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('Physical Walk MapApp wiring', () => {
  it('does not mount controls or replace providers when flag is disabled', () => {
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '0'); const { app } = harness(); app.installPhysicalWalk();
    expect(app.physicalWalk).toBeNull(); expect(controls.mount).not.toHaveBeenCalled();
  });
  it('acquires dot exclusively, retains real location, ignores competing callbacks and restores on end', () => {
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '1');
    const watch = vi.fn(() => 1); const clear = vi.fn();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: watch, clearWatch: clear } });
    const { app, state, normalStart, stop } = harness(); const real = state.userLocation;
    app.installPhysicalWalk();
    expect(app.physicalWalk.mode).toBe('route-guided');
    try {
      controls.start!();
      expect(stop).toHaveBeenCalled(); expect(watch).toHaveBeenCalledOnce();
      expect(app.blueDotService.setSimulatorParallelMode).toHaveBeenLastCalledWith(true, { compassGlow: true });
      const calls = app.blueDotService.applyProviderFrame.mock.calls.length;
      app.handleProviderFrame({ latitude: 6.6, longitude: 3.4, accuracy: 5, source: 'gps', timestamp: Date.now() });
      app.handleBlueDotSensorPosition({ coordinate: { latitude: 6, longitude: 3 }, heading: 90 });
      app.handleBlueDotAnimatedPosition({ coordinate: { latitude: 6, longitude: 3 }, heading: 180 });
      expect(app.blueDotService.applyProviderFrame).toHaveBeenCalledTimes(calls);
      expect(app.ingestPositionFrame).not.toHaveBeenCalled(); expect(state.userLocation).toBe(real);
      app.physicalWalk.end(); expect(normalStart).toHaveBeenCalledWith(state.route!.pathCoordinates);
      expect(clear).toHaveBeenCalledWith(1);
    } finally { app.disposePhysicalWalk(); }
  });
  it('permits remote demo route planning without changing real presence or AR gates', async () => {
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '1'); const { app, state } = harness(); const real = state.userLocation;
    expect(await app.blockNavigationOutsideVenue('route')).toBe(false); expect(state.userLocation).toBe(real);
    state.guestAccessAllowed = false; state.guestAccessReason = 'expired';
    expect(await app.blockNavigationOutsideVenue('route')).toBe(true);
  });
  it('allows AR access with a selected route while the demo is active', async () => {
    const { app } = harness(); app.physicalWalk = { running: true };
    expect(await app.blockNavigationOutsideVenue('ar')).toBe(false);
    expect(app.showToast).not.toHaveBeenCalled();
  });
  it('reclaims ownership if an earlier user-requested sensor enable resolves during the demo', async () => {
    const { app, state } = harness(); state.locationPermission = 'granted';
    app.locationAttempted = true;
    let finish!: () => void;
    app.blueDotService.startTracking = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    app.blueDotService.stopTracking = vi.fn(); app.blueDotService.enableHeading = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) } });
    const pending = app.maybeAutoStartBlueDot(); await Promise.resolve();
    app.physicalWalk = { running: true }; finish(); await pending;
    expect(app.blueDotService.stopTracking).toHaveBeenCalledOnce();
    expect(app.blueDotService.enableHeading).toHaveBeenCalledWith({ forceDuringSimulator: true });
  });

  it.each([true, false])('starts automatically when a route is ready (demo flag: %s)', enabled => {
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', enabled ? '1' : '0');
    const { app, state, normalStart } = harness();
    app.startPhysicalWalkDemo = vi.fn().mockReturnValue(true);
    app.seedRouteProgressFromUser = vi.fn().mockReturnValue({ traveled: 0, remaining: 111 });
    app.alongPathStabilizer = { reset: vi.fn() };
    app.routePlanner.setRoutePlanningPaused = vi.fn();
    app.routePlanner.beginGuidedNavigation = vi.fn();
    app.routePlanner.markersState = {};
    state.route!.legs = [];
    app.applyRoute(state.route);
    expect(app.startPhysicalWalkDemo).toHaveBeenCalledTimes(enabled ? 1 : 0);
    expect(normalStart).toHaveBeenCalledTimes(enabled ? 0 : 1);
  });

  it('does not start a GPS watch before a valid route is available', () => {
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '1');
    const watch = vi.fn(); vi.stubGlobal('navigator', { geolocation: { watchPosition: watch } });
    const { app, state } = harness(); state.route = null;
    app.installPhysicalWalk();
    try {
      expect(app.startPhysicalWalkDemo()).toBe(false);
      expect(watch).not.toHaveBeenCalled();
      expect(app.physicalWalk.running).toBe(false);
    } finally { app.disposePhysicalWalk(); }
  });

  it.each([true, false])('stopping a competing provider preserves demo heading ownership (active: %s)', active => {
    const { app } = harness();
    app.physicalWalk = active ? { running: true } : null;
    app.positionProvider = { stop: vi.fn() };
    const stop = app.positionProvider.stop;
    app.floorOrchestrator = { reset: vi.fn(), getState: vi.fn().mockReturnValue({}) };
    MapApp.prototype['stopPositionProvider'].call(app, { preserveProgress: true });
    expect(stop).toHaveBeenCalledOnce();
    expect(app.blueDotService.setSimulatorParallelMode).toHaveBeenCalledTimes(active ? 0 : 1);
    if (!active) expect(app.blueDotService.setSimulatorParallelMode).toHaveBeenCalledWith(false);
  });

  it('preserves physical provider ownership when permission completes late', async () => {
    const { app, state } = harness(); state.locationPermission = 'granted';
    app.blockNavigationOutsideVenue = vi.fn().mockResolvedValue(false);
    let finish!: (value: boolean) => void;
    app.ensureLocationEnabledForAction = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    app.alongPathStabilizer = { reset: vi.fn() };
    app.resolveNavigationSource = () => 'gps';
    app.blueDotService.enableHeading = vi.fn().mockResolvedValue(undefined);
    app.blueDotService.applySimulatorFrame = vi.fn();
    const pending = app.startRouteMovement(); await Promise.resolve();
    app.physicalWalk = { running: true };
    finish(true); await pending;
    expect(app.blueDotService.applySimulatorFrame).not.toHaveBeenCalled();
    expect(app.liveRouteTracking).not.toBe(true);
  });

  it('attaches and releases opt-in diagnostics without adding a GPS watch', () => {
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '1');
    vi.stubEnv('VITE_PHYSICAL_WALK_POSITION_DIAGNOSTICS', '1');
    vi.stubEnv('VITE_PHYSICAL_WALK_POSITION_OVERLAY', '0');
    const watch = vi.fn(() => 1); vi.stubGlobal('navigator', { geolocation: { watchPosition: watch, clearWatch: vi.fn() } });
    const { app } = harness(); app.installPhysicalWalk();
    try {
      controls.start!(); expect(app.physicalWalk.running).toBe(true);
      expect(watch).toHaveBeenCalledOnce();
      const hook = app.blueDotService.setPositionDiagnostics.mock.calls.at(-1)[0];
      hook('position.audit.marker-frame', { sdkLatitude: 43, sdkLongitude: -80 });
      expect(app.physicalWalk.positionAudit.snapshot().points.sdk).toMatchObject({ latitude: 43, longitude: -80 });
      app.physicalWalk.end(); expect(app.blueDotService.setPositionDiagnostics).toHaveBeenLastCalledWith(null);
    } finally { app.disposePhysicalWalk(); }
  });

});

it('wires guided route rendering and stops publishing when the selected route is replaced', () => {
  vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '1');
  vi.stubGlobal('navigator', { geolocation: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() } });
  const { app, state } = harness(); app.blueDotService.setPhysicalWalkRoute = vi.fn();
  app.installPhysicalWalk(); app.physicalWalk.mode = 'route-guided';
  try {
    controls.start!();
    expect(app.blueDotService.setPhysicalWalkRoute).toHaveBeenCalledWith(state.route!.pathCoordinates);
    expect(state.routeGuidedDemoRemainingSeconds).toBeGreaterThan(0);
    state.route = { ...state.route!, pathCoordinates: [...state.route!.pathCoordinates] };
    const count = app.blueDotService.applyProviderFrame.mock.calls.length;
    app.physicalWalk.update();
    expect(app.physicalWalk.running).toBe(false);
    expect(app.blueDotService.applyProviderFrame).toHaveBeenCalledTimes(count);
    expect(app.blueDotService.setPhysicalWalkRoute).toHaveBeenLastCalledWith(null);
    expect(state.routeGuidedDemoRemainingSeconds).toBeNull();
  } finally { app.disposePhysicalWalk(); }
});

describe('route readiness starts existing navigation', () => {
  it('starts after calculation finishes', async () => {
    const { app, state } = harness();
    const route = state.route;
    app.routePlanner.generateRoute = vi.fn(async () => route);
    app.applyRoute = vi.fn();
    app.startRouteMovement = vi.fn(async () => {
      expect(state.isCalculatingRoute).toBe(false);
    });
    await app.generateAndShowRoute();
    expect(app.applyRoute).toHaveBeenCalledWith(route);
    expect(app.startRouteMovement).toHaveBeenCalledOnce();
  });
  it('keeps recovery available without starting a failed route', async () => {
    const { app, state } = harness();
    app.routePlanner.generateRoute = vi.fn(async () => { throw new Error('No path'); });
    app.routePlanner.setRoutePlanningPaused = vi.fn();
    app.alongPathStabilizer = { reset: vi.fn() };
    app.startRouteMovement = vi.fn();
    await app.generateAndShowRoute();
    expect(state.isCalculatingRoute).toBe(false);
    expect(state.routeNotFound).toBe(true);
    expect(state.showRouteSheet).toBe(true);
    expect(app.startRouteMovement).not.toHaveBeenCalled();
  });
});
