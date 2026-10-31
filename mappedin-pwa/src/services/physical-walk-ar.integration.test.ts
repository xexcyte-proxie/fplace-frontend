import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { UiRoot } from '../ui/ui-root';
import { initialAppState, type RoutePayload } from '../types';
import { offset } from '../position/physical-walk/transform';
import { openArFullscreen, closeArFullscreen, buildArRoutePayloadForHandoff, syncNavigationToAr } from './ar-service';
import { navigationStateSynchronizer } from '../routing/navigation-state-synchronizer';
vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('../position/physical-walk/controls', () => ({ mountPhysicalWalkControls: vi.fn(() => () => {}) }));
vi.mock('./ar-service', async importOriginal => ({
  ...await importOriginal<typeof import('./ar-service')>(),
  isArSameOrigin: () => true,
  buildArRoutePayloadForHandoff: vi.fn(() => ({ route: 'selected-route' })),
  buildArUrl: vi.fn(() => '/ar/'),
  openArFullscreen: vi.fn(), closeArFullscreen: vi.fn(), setArMinimized: vi.fn(), setArMaximized: vi.fn(),
  syncNavigationToAr: vi.fn(), notifyArIframePermissions: vi.fn(), warmArIframe: vi.fn(),
}));
vi.mock('./media-permission-service', async importOriginal => ({
  ...await importOriginal<typeof import('./media-permission-service')>(),
  beginArMediaPermissionPrime: vi.fn(),
  consumeArMediaPermissionPrime: vi.fn().mockResolvedValue({ camera: 'granted' }),
}));
vi.mock('../routing/navigation-state-synchronizer', () => ({ navigationStateSynchronizer: { sync: vi.fn() } }));
vi.mock('./guest-access-service', async importOriginal => ({
  ...await importOriginal<typeof import('./guest-access-service')>(),
  isGuestMode: () => false,
}));
function harness(active = true, mode = 'route-guided') {
  const state = initialAppState();
  state.route = { pathCoordinates: [{ latitude: 43, longitude: -80, floorId: 'g' }, { latitude: 43.001, longitude: -80, floorId: 'g' }], legs: [], maneuvers: [], distanceMeters: 111 } as unknown as RoutePayload;
  state.selectedVenueId = '1'; state.forumVenues = [{ id: 1, name: 'Stadium', latitude: 43, longitude: -80 }];
  state.userLocation = { latitude: 6.5, longitude: 3.4, accuracy: 4 }; state.locationPermission = 'granted';
  const demo = { running: active, mode, end: vi.fn(() => { demo.running = false; }) };
  const app = Object.create(MapApp.prototype) as any;
  Object.assign(app, { store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) }, physicalWalk: demo,
    showToast: vi.fn(), getNavigationProgressSnapshot: vi.fn(() => ({ alongPathMeters: 0 })),
    maybeShowContextualProductTour: vi.fn(), consumeGuestArTrialAfterLaunch: vi.fn(),
    resumeRouteNavigation: vi.fn(), warmArSensors: vi.fn(),
  });
  return { state, app, demo };
}
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('AR access independent of physical walk demo', () => {
  it.each(['route-guided', 'raw'])('opens selected route from Nigeria without stopping the active %s demo', async mode => {
    vi.stubEnv('VITE_ALLOW_REMOTE_AR', '');
    const { state, app, demo } = harness(true, mode); const route = state.route;
    await app.openAr();
    expect(demo.end).not.toHaveBeenCalled(); expect(demo.running).toBe(true);
    expect(openArFullscreen).toHaveBeenCalledOnce(); expect(state.arPresentation).toBe('fullscreen');
    expect(state.route).toBe(route); expect(buildArRoutePayloadForHandoff).toHaveBeenCalledWith(route, expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything());
  });
  it('opens AR with a selected route when the demo is stopped or disabled', async () => {
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '0'); const { state, app, demo } = harness(false);
    await app.openAr(); expect(openArFullscreen).toHaveBeenCalledOnce(); expect(demo.end).not.toHaveBeenCalled();
    expect(state.arPresentation).toBe('fullscreen');
  });
  it('handles direct fullscreen entry while a demo is running', async () => {
    const { app, demo } = harness(); await app.enterArFullscreen();
    expect(demo.end).not.toHaveBeenCalled(); expect(openArFullscreen).toHaveBeenCalledOnce();
  });
  it('retains guest access checks without stopping a demo if access is denied', async () => {
    const { app, state, demo } = harness(); state.guestAccessAllowed = false; state.guestAccessReason = 'expired';
    await app.openAr(); expect(openArFullscreen).not.toHaveBeenCalled(); expect(demo.end).not.toHaveBeenCalled(); expect(app.showToast).toHaveBeenCalled();
  });
  it('requires a generated route before AR can open', async () => {
    vi.stubEnv('VITE_ALLOW_REMOTE_AR', '1'); const { app, state, demo } = harness(); state.route = null;
    await app.openAr(); expect(openArFullscreen).not.toHaveBeenCalled(); expect(demo.end).not.toHaveBeenCalled();
    expect(app.showToast).toHaveBeenCalledWith('Generate a route before opening AR.');
  });
  it('keeps AR running on reroute instead of restarting the physical demo', () => {
    vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '1');
    const { app, state } = harness(false); state.arPresentation = 'fullscreen';
    app.routePlanner = { setRoutePlanningPaused: vi.fn(), beginGuidedNavigation: vi.fn(), markersState: {} };
    app.seedRouteProgressFromUser = vi.fn(() => ({ traveled: 0, remaining: 111 }));
    app.alongPathStabilizer = { reset: vi.fn() }; app.startPhysicalWalkDemo = vi.fn(); app.startPositionProvider = vi.fn();
    app.applyRoute(state.route);
    expect(app.startPhysicalWalkDemo).not.toHaveBeenCalled(); expect(app.startPositionProvider).toHaveBeenCalledWith(state.route!.pathCoordinates);
    expect(navigationStateSynchronizer.sync).toHaveBeenCalledWith(expect.objectContaining({ route: state.route, reason: 'reroute' }));
  });
  it('keeps the AR button enabled for a ready remote route', () => {
    const { state, app } = harness(); const ui = Object.create(UiRoot.prototype) as any;
    const html = ui.routeSheet(state, app); const button = html.match(/<button[^>]*id="open-ar-btn"[^>]*>/)![0];
    expect(button).not.toContain('disabled'); expect(button).toContain('Open AR for this route');
    state.route = null; expect(ui.routeSheet(state, app).match(/<button[^>]*id="open-ar-btn"[^>]*>/)![0]).toContain('disabled');
  });
});

function liveHarness() {
  vi.useFakeTimers(); vi.setSystemTime(1000); vi.stubEnv('VITE_PHYSICAL_WALK_DEMO', '1');
  const { app, state } = harness(false);
  state.route!.routeId = 'stadium-route'; state.route!.routeVersion = 1;
  state.route!.pathCoordinates = [
    { latitude: 43, longitude: -80, floorId: 'g' },
    { ...offset({ latitude: 43, longitude: -80 }, { east: 0, north: 10 }), floorId: 'g' },
    { ...offset({ latitude: 43, longitude: -80 }, { east: 40, north: 10 }), floorId: 'g' },
  ];
  state.route!.distanceMeters = 50;
  const geo = { watchPosition: vi.fn(() => 7), clearWatch: vi.fn() };
  vi.stubGlobal('navigator', { geolocation: geo });
  let last: any;
  const blueDot = { applyProviderFrame: vi.fn(p => { last = { coordinate: p, heading: last?.heading ?? 90 }; }),
    getLastPosition: vi.fn(() => last), setPhysicalWalkRoute: vi.fn(), setSimulatorParallelMode: vi.fn(),
    setHeadingDiagnostics: vi.fn(), setPositionDiagnostics: vi.fn(), follow: vi.fn(), startTracking: vi.fn(),
    enableHeading: vi.fn().mockResolvedValue(undefined), stopTracking: vi.fn(),
  };
  Object.assign(app, { physicalWalk: null, loadedVenueMapId: 'stadium-map', mapView: { setFloor: vi.fn() },
    routePlanner: { clearTravelledPathTracking: vi.fn(), updateTravelledPath: vi.fn() },
    blueDotService: blueDot, stopPositionProvider: vi.fn(), startPositionProvider: vi.fn(), isArOpen: () => false,
    dismissArMapTour: vi.fn(), maybeRevealArrivalDialog: vi.fn(),
  });
  delete app.getNavigationProgressSnapshot; delete app.resumeRouteNavigation; delete app.warmArSensors;
  app.installPhysicalWalk(); app.startPhysicalWalkDemo();
  const send = (meters: number, advance = 1000) => {
    vi.advanceTimersByTime(advance);
    const fix = offset({ latitude: 6.5, longitude: 3.4 }, { east: 0, north: meters });
    app.physicalWalk.ingest({ ...fix, source: 'gps', accuracy: 4, timestamp: Date.now() });
  };
  send(0, 0); send(0); send(0);
  return { app, state, geo, blueDot, send };
}
describe('shared physical-walk authority across the AR lifecycle', () => {
  it('keeps the same physical session and GPS watch across open, close, reopen and continued walking', async () => {
    const h = liveHarness();
    try {
      for (let m = 1; m <= 8; m++) h.send(m);
      const before = h.app.getNavigationProgressSnapshot(); const rendered = h.blueDot.applyProviderFrame.mock.calls.length;
      await h.app.openAr();
      expect(h.app.physicalWalk.running).toBe(true); expect(h.geo.clearWatch).not.toHaveBeenCalled();
      expect(h.app.getNavigationProgressSnapshot()).toEqual(before);
      expect(vi.mocked(syncNavigationToAr).mock.calls.at(-1)![0]).toEqual(before);
      for (let m = 9; m <= 16; m++) h.send(m);
      const during = h.app.getNavigationProgressSnapshot();
      expect(during.alongPathMeters).toBeGreaterThan(before.alongPathMeters);
      expect(h.blueDot.applyProviderFrame.mock.calls.length).toBeGreaterThan(rendered);
      expect(during.routeTraveledMeters).toBe(h.state.routeTraveledMeters);
      expect(during.routeRemainingMeters).toBe(h.state.routeRemainingMeters);
      expect(during.simulationSessionId).toBe(before.simulationSessionId);
      expect(during.longitude).toBeGreaterThan(h.state.route!.pathCoordinates[1].longitude); // Virtual corner; physical direction unchanged.
      h.app.closeAr(); for (let m = 17; m <= 22; m++) h.send(m);
      const after = h.app.getNavigationProgressSnapshot(); expect(after.alongPathMeters).toBeGreaterThan(during.alongPathMeters);
      await h.app.openAr(); expect(h.app.getNavigationProgressSnapshot()).toEqual(after);
      expect(h.geo.watchPosition).toHaveBeenCalledOnce(); expect(h.geo.clearWatch).not.toHaveBeenCalled();
      expect(h.blueDot.startTracking).not.toHaveBeenCalled(); expect(h.app.startPositionProvider).not.toHaveBeenCalled();
      expect(h.blueDot.enableHeading).toHaveBeenCalledWith({ forceDuringSimulator: true });
    } finally { h.app.disposePhysicalWalk(); }
  });
  it('ignores competing raw GPS, holds committed progress while stationary, and shares arrival exactly', async () => {
    const h = liveHarness();
    try {
      await h.app.openAr(); for (let m = 1; m <= 8; m++) h.send(m);
      const before = h.app.getNavigationProgressSnapshot(); const renders = h.blueDot.applyProviderFrame.mock.calls.length;
      h.app.handleProviderFrame({ latitude: 6, longitude: 3, source: 'gps', accuracy: 4, timestamp: Date.now() });
      for (let i = 0; i < 6; i++) h.send(8);
      expect(h.app.getNavigationProgressSnapshot()).toEqual(before); expect(h.blueDot.applyProviderFrame).toHaveBeenCalledTimes(renders);
      for (let m = 9; m <= 49; m++) h.send(m);
      expect(h.app.getNavigationProgressSnapshot().routeSimulationComplete).toBe(false);
      for (let m = 50; m <= 54; m++) h.send(m);
      const final = h.app.getNavigationProgressSnapshot();
      expect(final.routeSimulationComplete).toBe(true); expect(final.routeRemainingMeters).toBe(0);
      expect(h.state.routeSimulationComplete).toBe(true); expect(vi.mocked(syncNavigationToAr).mock.calls.at(-1)![0]).toEqual(final);
    } finally { h.app.disposePhysicalWalk(); }
  });
});


it.each(['closed', 'minimized', 'fullscreen'] as const)('resetting the 2D route closes AR only when minimized (current mode: %s)', async presentation => {
  const { app, state, demo } = harness(); state.arPresentation = presentation;
  Object.assign(app, {
    routePlanner: { clearRoute: vi.fn(), endGuidedNavigation: vi.fn(), setRoutePlanningPaused: vi.fn() },
    alongPathStabilizer: { reset: vi.fn() }, stopPositionProvider: vi.fn(),
  });
  await app.clearRoute();
  expect(closeArFullscreen).toHaveBeenCalledTimes(presentation === 'minimized' ? 1 : 0);
  expect(state.arPresentation).toBe(presentation === 'minimized' ? 'closed' : presentation);
  expect(state.route).toBeNull(); expect(state.routeSimulationComplete).toBe(false);
  expect(demo.end).toHaveBeenCalledOnce(); expect(app.stopPositionProvider).toHaveBeenCalledOnce();
});
