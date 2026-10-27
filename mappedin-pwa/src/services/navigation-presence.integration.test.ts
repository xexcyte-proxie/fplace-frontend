import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { initialAppState } from '../types';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));

function harness(atVenue = false) {
  const state = initialAppState();
  Object.assign(state, {
    selectedVenueId: '1',
    selectedGateId: '10',
    forumVenues: [{ id: 1, name: 'Test venue', latitude: 6.6, longitude: 3.35 }],
    locationPermission: 'granted',
    userLocation: { latitude: atVenue ? 6.6 : 43, longitude: atVenue ? 3.35 : -79, accuracy: 5 },
    mapStatus: 'ready',
    navigateView: 'home',
  });
  const app = Object.create(MapApp.prototype) as any;
  Object.assign(app, {
    store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) },
    showToast: vi.fn(),
    consumeGuestArTrialAfterLaunch: vi.fn(),
    ensureMapForSelectedVenue: vi.fn(),
  });
  return { app, state };
}

describe('venue navigation access', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ALLOW_REMOTE_AR', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['openAr', 'confirmGuestArOneTimeTrial', 'enterArFullscreen', 'confirmArRoutePrompt', 'openVenueArFromHome'])(
    'blocks off-site access through %s', async method => {
      const { app, state } = harness();
      await app[method]();
      expect(state.navigateView).toBe('home');
      expect(app.showToast).toHaveBeenCalledWith(
        method === 'confirmArRoutePrompt'
          ? expect.stringContaining('only available at Test venue')
          : expect.stringContaining('Head there to try AR navigation'),
      );
    },
  );
  it('blocks AR with unverified location', async () => {
    const { app, state } = harness();
    state.userLocation = null;
    await app.openAr();
    expect(state.navigateView).toBe('home');
    expect(app.showToast).toHaveBeenCalledWith(expect.stringContaining("couldn't verify"));
  });
  it('opens 2D without consuming any guest trial at the venue', () => {
    const { app, state } = harness(true);
    app.openNavigateMap();
    expect(state.navigateView).toBe('map');
  });
  it('does not activate the Navigate tab for first-time venue visitors', () => {
    const { app, state } = harness(true);
    state.activeTab = 'social';
    state.homeExperience = 'first-visit';

    app.setActiveTab('map');

    expect(state.activeTab).toBe('home');
    expect(state.navigateView).toBe('home');
  });
  it.each(['openNavigateMap', 'waitForMapReadyThenEnterNavigate'])(
    'allows off-site map browsing through %s', async method => {
      const { app, state } = harness();
      await app[method]();
      expect(state.navigateView).toBe('map');
      expect(app.showToast).not.toHaveBeenCalled();
    },
  );
  it('allows expired guests to browse the map read-only', () => {
    const { app, state } = harness(true);
    state.guestAccessAllowed = false;
    state.guestAccessReason = 'Guest trial expired';
    app.openNavigateMap();
    expect(state.navigateView).toBe('map');
  });
  it('routes an expired guest token recovery to the 2D map', async () => {
    const { app, state } = harness(true);
    state.authStep = 'create';
    state.createAccountPrompt = 'invalid-token';
    app.enterSelectedVenue = vi.fn();
    app.ensureMapForSelectedVenue = vi.fn();

    await app.routeExpiredGuestToReadonlyMap();

    expect(app.enterSelectedVenue).not.toHaveBeenCalled();
    expect(app.ensureMapForSelectedVenue).toHaveBeenCalledOnce();
    expect(state.authStep).toBe('none');
    expect(state.createAccountPrompt).toBeNull();
    expect(state.onboardingComplete).toBe(true);
    expect(state.activeTab).toBe('map');
    expect(state.navigateView).toBe('map');
  });
  it('submits venue selection to the 2D map when the guest token is expired', () => {
    const { app, state } = harness(true);
    state.authStep = 'venue-select';
    state.guestAccessAllowed = false;
    state.guestAccessReason = 'Guest trial expired';
    app.enterSelectedVenue = vi.fn();
    app.routeExpiredGuestToReadonlyMap = vi.fn();

    app.submitVenueSelect();

    expect(app.enterSelectedVenue).not.toHaveBeenCalled();
    expect(app.routeExpiredGuestToReadonlyMap).toHaveBeenCalledOnce();
    expect(app.showToast).toHaveBeenCalledWith(
      expect.stringContaining('still view the map'),
    );
  });
  it('recovers invalid guest JWT failures during venue selection to the 2D map', () => {
    const { app, state } = harness(true);
    state.authStep = 'venue-select';
    state.guestId = 'guest_1';
    app.routeExpiredGuestToReadonlyMap = vi.fn();
    app.routeToCreateAccountForInvalidToken = vi.fn();

    app.handleAuthFailure(
      new Error('Given token not valid for any token type'),
      'Could not load sections for this venue.',
    );

    expect(app.routeExpiredGuestToReadonlyMap).toHaveBeenCalledOnce();
    expect(app.routeToCreateAccountForInvalidToken).not.toHaveBeenCalled();
    expect(app.showToast).toHaveBeenCalledWith(
      expect.stringContaining('still view the map'),
    );
  });
  it('blocks expired guests from setting route points', async () => {
    const { app, state } = harness(true);
    state.guestAccessAllowed = false;
    state.guestAccessReason = 'Guest trial expired';
    app.mapData = { getByType: () => [] };
    app.routePlanner = { setOriginFromLocation: vi.fn(), setDestinationFromLocation: vi.fn() };
    await app.setOriginFromLocationCard({ anchor: {}, name: 'Place' });
    expect(app.routePlanner.setOriginFromLocation).not.toHaveBeenCalled();
    expect(app.showToast).toHaveBeenCalledWith(expect.stringContaining('guest trial has ended'));
  });
  it.each([false, true])('gates map tap route points (at venue: %s)', async atVenue => {
    const { app } = harness(atVenue);
    const handlers: Record<string, (event: unknown) => Promise<void>> = {};
    app.mapView = { on: (name: string, handler: any) => { handlers[name] = handler; } };
    app.routePlanner = { handleMapClick: vi.fn(), markersState: {} };
    app.resolveTapCoordinateFromPointer = vi.fn();
    app.scheduleAutoRoute = vi.fn();
    app.wireMapEvents();
    await handlers.click({ coordinate: { latitude: 6.6, longitude: 3.35 } });
    expect(app.routePlanner.handleMapClick).toHaveBeenCalledTimes(atVenue ? 1 : 0);
    expect(app.scheduleAutoRoute).toHaveBeenCalledTimes(atVenue ? 1 : 0);
  });
  it.each(['setOriginFromLocationCard', 'setDestinationFromLocationCard', 'selectSearchResult'])(
    'blocks off-site route selection through %s', async method => {
      const { app } = harness();
      app.mapData = { getByType: () => [] };
      app.routePlanner = { setOriginFromLocation: vi.fn(), setDestinationFromLocation: vi.fn() };
      await app[method]({ anchor: {}, name: 'Place' });
      expect(app.routePlanner.setOriginFromLocation).not.toHaveBeenCalled();
      expect(app.routePlanner.setDestinationFromLocation).not.toHaveBeenCalled();
      expect(app.showToast).toHaveBeenCalledWith(expect.stringContaining('only available at Test venue'));
    },
  );
  it('keeps the map open when an off-site location update arrives', () => {
    const { app, state } = harness(true);
    state.navigateView = 'map';
    app.publishUserLocation({ latitude: 43, longitude: -79, accuracy: 5 });
    expect(state.navigateView).toBe('map');
    expect(state.userLocation?.latitude).toBe(43);
  });
});
