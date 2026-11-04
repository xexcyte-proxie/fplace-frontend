import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { LocationService } from './location-service';
import { initialAppState } from '../types';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));
vi.mock('../permissions/data/datasources/permission-choice-local-datasource', () => ({ permissionChoiceLocalDatasource: { saveLocation: vi.fn() } }));

const coords = { latitude: 6, longitude: 3, accuracy: 10 };
function harness() {
  const state = { ...initialAppState(), onboardingComplete: true, authStep: 'location-required', authStepBeforeLocation: 'none', locationPermanentlyDenied: true, locationPermission: 'denied' } as any;
  const app = Object.create(MapApp.prototype) as any;
  Object.assign(app, {
    store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) },
    locationGateRequestId: 0, locationSyncGeneration: 0, locationSyncInFlight: false,
    locationSyncPending: false, locationAttempted: true,
    locationService: {
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestLocation: vi.fn().mockResolvedValue(coords),
      isPermissionDeniedError: (error: any) => error.code === 1,
      geolocationErrorMessage: (error: any) => `Location failure ${error.code}`,
    },
    stopLiveUserLocationWatch: vi.fn(),
    persistLocationChoice: vi.fn((choice) => { state.locationPermission = choice; }),
    continueAfterLocationGranted: vi.fn(), showToast: vi.fn(),
  });
  return { app, state };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('permission synchronization in the existing MapApp store', () => {
  it('closes a stale dialog before a fresh GPS fix resolves, without the loading guard deadlock', async () => {
    const { app, state } = harness();
    let resolve!: (value: unknown) => void;
    app.locationService.requestLocation.mockReturnValue(new Promise(yes => { resolve = yes; }));
    const pending = app.refreshLocationGateAfterBrowserSettingsChange('granted');
    await vi.waitFor(() => expect(app.locationService.requestLocation).toHaveBeenCalledOnce());
    expect(state.authStep).toBe('none');
    expect(state.locationPermission).toBe('granted');
    expect(state.locationGateLoading).toBe(true);
    expect(app.locationService.requestLocation).toHaveBeenCalledWith({ maximumAgeMs: 0 });
    resolve(coords);
    await pending;
    expect(state.locationGateLoading).toBe(false);
    expect(state.userLocation).toEqual(coords);
  });

  it.each([2, 3])('keeps permission granted when GPS fails with code %s', async code => {
    const { app, state } = harness();
    app.locationService.requestLocation.mockRejectedValue({ code });
    await app.refreshLocationGateAfterBrowserSettingsChange('granted');
    expect(state.authStep).toBe('none');
    expect(state.locationPermission).toBe('granted');
    expect(state.locationGateLoading).toBe(false);
    expect(state.locationGateError).toBe(`Location failure ${code}`);
  });

  it('revocation wins over a pending GPS success', async () => {
    const { app, state } = harness();
    let resolve!: (value: unknown) => void;
    app.locationService.requestLocation.mockReturnValue(new Promise(yes => { resolve = yes; }));
    app.locationService.queryPermission.mockResolvedValue('denied');
    const pending = app.refreshLocationGateAfterBrowserSettingsChange('granted');
    await vi.waitFor(() => expect(app.locationService.requestLocation).toHaveBeenCalledOnce());
    await app.refreshLocationGateAfterBrowserSettingsChange('denied');
    resolve(coords);
    await pending;
    await vi.waitFor(() => expect(app.locationSyncInFlight).toBe(false));
    expect(state.locationPermission).toBe('denied');
    expect(state.userLocation).toBeNull();
    expect(state.locationGateLoading).toBe(false);
    expect(app.persistLocationChoice).not.toHaveBeenCalledWith('granted');
  });

  it('coalesces overlapping lifecycle rechecks', async () => {
    const { app } = harness();
    let resolve!: (value: unknown) => void;
    app.locationService.requestLocation.mockReturnValue(new Promise(yes => { resolve = yes; }));
    const pending = app.refreshLocationGateAfterBrowserSettingsChange();
    await vi.waitFor(() => expect(app.locationService.requestLocation).toHaveBeenCalledOnce());
    // A running watcher after success avoids another acquisition in the queued recheck.
    app.persistLocationChoice.mockImplementation(() => { app.stopUserLocationWatch = () => {}; });
    await app.refreshLocationGateAfterBrowserSettingsChange();
    resolve(coords);
    await pending;
    await vi.waitFor(() => expect(app.locationSyncInFlight).toBe(false));
    expect(app.locationService.requestLocation).toHaveBeenCalledOnce();
  });

  it('does not automatically request permission on initial prompt state', async () => {
    const { app } = harness();
    await app.refreshLocationGateAfterBrowserSettingsChange('prompt');
    expect(app.locationService.requestLocation).not.toHaveBeenCalled();
  });

  it.each(['prompt', 'denied', 'unknown'])('does not prompt automatically after settings return with %s', async permission => {
    const { app, state } = harness();
    app.locationService.queryPermission.mockResolvedValue(permission);
    await app.refreshLocationGateAfterBrowserSettingsChange(undefined, true);
    expect(app.locationService.requestLocation).not.toHaveBeenCalled();
    expect(state.authStep).toBe(permission === 'prompt' ? 'location-permission' : 'location-required');
    expect(state.locationPermanentlyDenied).toBe(permission === 'denied');
  });

  it('a passive grant after login never starts GPS', async () => {
    const { app, state } = harness();
    app.locationAttempted = false;
    state.authStep = 'none';
    await app.refreshLocationGateAfterBrowserSettingsChange('granted');
    expect(app.locationService.requestLocation).not.toHaveBeenCalled();
    expect(state.locationGateLoading).toBe(false);
  });

  it('sign-in completion bypasses location even with a stored grant', async () => {
    const { app } = harness();
    await app.beginLocationPermissionGate();
    expect(app.continueAfterLocationGranted).toHaveBeenCalledOnce();
    expect(app.locationService.queryPermission).not.toHaveBeenCalled();
    expect(app.locationService.requestLocation).not.toHaveBeenCalled();
  });

  it('dismissal prevents foreground GPS and dialog reopening', async () => {
    const { app, state } = harness();
    await app.dismissLocationGate();
    await app.refreshLocationGateAfterBrowserSettingsChange('granted', true);
    expect(state.authStep).toBe('none');
    expect(app.locationService.requestLocation).not.toHaveBeenCalled();
  });

  it.each([true, false])('resolves the original action when recovery=%s', async ready => {
    const { app } = harness();
    const complete = vi.fn();
    app.pendingLocationAction = complete;
    if (ready) await app.refreshLocationGateAfterBrowserSettingsChange('granted');
    else await app.dismissLocationGate();
    expect(complete).toHaveBeenCalledExactlyOnceWith(ready);
    expect(app.pendingLocationAction).toBeNull();
  });

  it('recognizes a grant reset to prompt without calling it a permanent denial', async () => {
    const { app, state } = harness();
    state.locationPermission = 'granted';
    await app.refreshLocationGateAfterBrowserSettingsChange('prompt');
    expect(state.locationPermission).toBe('undecided');
    expect(state.locationPermanentlyDenied).toBe(false);
    expect(app.locationService.requestLocation).not.toHaveBeenCalled();
  });

  it('keeps the browser grant when device access reports permission denied', async () => {
    const { app, state } = harness();
    app.locationService.requestLocation.mockRejectedValue({ code: 1 });
    await app.refreshLocationGateAfterBrowserSettingsChange('granted');
    expect(state.locationPermission).toBe('granted');
    expect(state.locationGateError).toContain('could not be confirmed');
    expect(state.locationGateLoading).toBe(false);
  });

  it.each(['physical', 'route'])('preserves %s simulation and route state', async mode => {
    const { app, state } = harness();
    const route = { id: 'active-route' };
    Object.assign(state, { activeRoute: route, routeSimulating: mode === 'route', activeTab: 'navigate', routeProgress: 0.7 });
    app.physicalWalk = { running: mode === 'physical' };
    await app.refreshLocationGateAfterBrowserSettingsChange('granted');
    expect(app.locationService.requestLocation).not.toHaveBeenCalled();
    expect(state.activeRoute).toBe(route);
    expect(state.routeProgress).toBe(0.7);
    expect(state.activeTab).toBe('navigate');
    expect(app.physicalWalk.running).toBe(mode === 'physical');
  });
});

describe('feature-detected permission and lifecycle listeners', () => {
  function environment(query?: ReturnType<typeof vi.fn>) {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', { geolocation: {}, ...(query ? { permissions: { query } } : {}) });
    return { win, doc };
  }

  it('observes changes, coalesces resume events, and cleans up without polling', async () => {
    vi.useFakeTimers();
    const status = Object.assign(new EventTarget(), { state: 'denied' });
    const query = vi.fn().mockResolvedValue(status);
    const { win, doc } = environment(query);
    const changed = vi.fn();
    const stop = new LocationService().observePermissionChanges(changed);
    await Promise.resolve();
    expect(changed).toHaveBeenLastCalledWith('denied');
    status.state = 'granted';
    status.dispatchEvent(new Event('change'));
    expect(changed).toHaveBeenLastCalledWith('granted');
    changed.mockClear();
    win.dispatchEvent(new Event('blur'));
    win.dispatchEvent(new Event('focus'));
    win.dispatchEvent(new Event('pageshow'));
    doc.dispatchEvent(new Event('resume'));
    await vi.advanceTimersByTimeAsync(100);
    expect(changed).toHaveBeenCalledExactlyOnceWith(undefined, true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(changed).toHaveBeenCalledOnce();
    stop();
    status.dispatchEvent(new Event('change'));
    win.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['missing', 'rejected'])('supports %s Permissions API via lifecycle callbacks', async mode => {
    vi.useFakeTimers();
    const { win, doc } = environment(mode === 'rejected' ? vi.fn().mockRejectedValue(new Error('Unsupported permission')) : undefined);
    const changed = vi.fn();
    const stop = new LocationService().observePermissionChanges(changed);
    await Promise.resolve(); await Promise.resolve();
    changed.mockClear();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(100);
    expect(changed).toHaveBeenCalledExactlyOnceWith(undefined, true);
    stop();
  });

  it('does not attach a late permission listener after disposal', async () => {
    let resolve!: (value: unknown) => void;
    const query = vi.fn().mockReturnValue(new Promise(yes => { resolve = yes; }));
    environment(query);
    const changed = vi.fn();
    const stop = new LocationService().observePermissionChanges(changed);
    stop();
    resolve(Object.assign(new EventTarget(), { state: 'granted' }));
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
  });
});
