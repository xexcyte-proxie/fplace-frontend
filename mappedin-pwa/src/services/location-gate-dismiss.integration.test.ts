import { describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { LocationService } from './location-service';
import { initialAppState } from '../types';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));

function harness() {
  const state = { ...initialAppState(), onboardingComplete: true, authStep: 'location-permission' as const, authStepBeforeLocation: 'none' as const };
  const app = Object.create(MapApp.prototype) as any;
  Object.assign(app, {
    store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) },
    locationGateRequestId: 0,
    locationService: {
      queryPermission: vi.fn().mockResolvedValue('prompt'),
      requestLocation: vi.fn(),
      isPermissionDeniedError: vi.fn().mockReturnValue(false),
    },
    persistLocationChoice: vi.fn(),
    continueAfterLocationGranted: vi.fn().mockResolvedValue(undefined),
    maybeAutoStartBlueDot: vi.fn(),
  });
  return { app, state };
}

describe('dismiss location gate', () => {
  it.each(['location-permission', 'location-required', 'location-error'])('dismisses %s while preserving the current app view', async (authStep) => {
    const { app, state } = harness();
    Object.assign(state, { authStep, activeTab: 'social', locationGateLoading: true });
    await app.dismissLocationGate();
    expect(state.authStep).toBe('none');
    expect(state.activeTab).toBe('social');
    expect(state.locationGateLoading).toBe(false);
    expect(app.continueAfterLocationGranted).not.toHaveBeenCalled();
    expect(app.persistLocationChoice).not.toHaveBeenCalled();
  });

  it('continues onboarding without requiring GPS or changing permission', async () => {
    const { app, state } = harness();
    state.onboardingComplete = false;
    await app.dismissLocationGate();
    expect(app.continueAfterLocationGranted).toHaveBeenCalledOnce();
    expect(app.persistLocationChoice).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'])('ignores late GPS %s after dismissal', async (outcome) => {
    const { app, state } = harness();
    let resolve!: (value: unknown) => void;
    let reject!: (error: Error) => void;
    app.locationService.requestLocation.mockReturnValue(new Promise((yes, no) => { resolve = yes; reject = no; }));
    const pending = app.enableLocationPermission();
    await vi.waitFor(() => expect(app.locationService.requestLocation).toHaveBeenCalledOnce());
    await app.dismissLocationGate();
    if (outcome === 'success') resolve({ latitude: 1, longitude: 2 });
    else reject(new Error('timeout'));
    await pending;
    expect(state.authStep).toBe('none');
    expect(state.locationGateLoading).toBe(false);
    expect(state.userLocation).toBeNull();
    expect(app.persistLocationChoice).not.toHaveBeenCalled();
    expect(app.maybeAutoStartBlueDot).not.toHaveBeenCalled();
  });

  it('ignores a late preflight result before starting GPS', async () => {
    const { app, state } = harness();
    let resolve!: (value: string) => void;
    app.locationService.queryPermission.mockReturnValue(new Promise((yes) => { resolve = yes; }));
    const pending = app.runLocationGateRequest({ fromPermissionRequired: false });
    await app.dismissLocationGate();
    resolve('unsupported');
    await pending;
    expect(state.authStep).toBe('none');
    expect(app.locationService.requestLocation).not.toHaveBeenCalled();
  });
});

 describe('direct location button requests', () => {
  it.each(['enableLocationPermission', 'retryLocationPermission', 'retryLocationRetrieval'])(
    '%s reaches the browser API synchronously without permission preflight', async (method) => {
      const { app, state } = harness();
      const getCurrentPosition = vi.fn();
      const query = vi.fn().mockResolvedValue({ state: 'denied' });
      vi.stubGlobal('navigator', { geolocation: { getCurrentPosition }, permissions: { query }, userActivation: { isActive: true } });
      app.locationService = new LocationService();
      try {
        const pending = app[method]();
        // Assert before yielding to a microtask: this is still the button's call stack.
        expect(getCurrentPosition).toHaveBeenCalledOnce();
        expect(query).not.toHaveBeenCalled();
        await app.dismissLocationGate();
        getCurrentPosition.mock.calls[0][1]({ code: 1, PERMISSION_DENIED: 1, message: 'Denied' });
        await pending;
        expect(state.authStep).toBe('none');
        expect(state.locationGateLoading).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
 });
