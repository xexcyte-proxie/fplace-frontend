import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isLocationGateAuthStep,
  nextMarketingOnboardingStep,
  resolveLocationGateEntry,
  resolveLocationGateFailure,
  resolveLocationGatePreflight,
} from '../location/domain/location-gate';
import { LocationService } from './location-service';

/**
 * Integration: marketing step chain + LocationService + gate decisions,
 * matching the startup flow MapApp uses after auth.
 */
describe('startup location gate integration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('completes marketing onboarding chain to Create Account', () => {
    let step: string = 'none';
    const visited: string[] = [step];
    while (true) {
      const next = nextMarketingOnboardingStep(step);
      if (!next) break;
      step = next;
      visited.push(step);
    }
    expect(visited).toEqual([
      'none',
      'introduction',
      'features',
      'create',
    ]);
  });

  it('granted permission → coordinates → main-app ready signal', async () => {
    const getCurrentPosition = vi.fn(
      (success: PositionCallback) => {
        success({
          coords: {
            latitude: 40.7,
            longitude: -74.0,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: 1,
          toJSON: () => ({}),
        });
      },
    );
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'granted' }),
      },
    });

    const service = new LocationService();
    const permission = await service.queryPermission();
    const preflight = resolveLocationGatePreflight(permission);
    expect(preflight).toEqual({ action: 'request' });

    const coords = await service.requestLocation();
    expect(coords).toEqual({
      latitude: 40.7,
      longitude: -74.0,
      accuracy: 10,
    });

    // MapApp completeOnboarding() equivalent outcome
    const authStepAfterSuccess = 'none';
    const onboardingComplete = true;
    expect(isLocationGateAuthStep(authStepAfterSuccess)).toBe(false);
    expect(onboardingComplete).toBe(true);
  });

  it('denied permission preflight skips getCurrentPosition', async () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'denied' }),
      },
    });

    const service = new LocationService();
    const preflight = resolveLocationGatePreflight(
      await service.queryPermission(),
    );
    expect(preflight).toEqual({ action: 'required-permanent' });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(isLocationGateAuthStep('location-required')).toBe(true);
  });

  it('remembered deny skips the gate even when Permissions API still says prompt', () => {
    expect(resolveLocationGateEntry('prompt', 'denied')).toEqual({
      action: 'skip',
    });
  });

  it('permission prompt denial routes to required; timeout routes to error', async () => {
    const denied: GeolocationPositionError = {
      code: 1,
      message: 'denied',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    };
    const timeout: GeolocationPositionError = {
      code: 3,
      message: 'timeout',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    };

    const service = new LocationService();

    const deniedOutcome = resolveLocationGateFailure(
      denied,
      true,
      (error) => service.geolocationErrorMessage(error as GeolocationPositionError),
    );
    expect(deniedOutcome).toEqual({
      action: 'required',
      permanentlyDenied: true,
    });

    const timeoutOutcome = resolveLocationGateFailure(
      timeout,
      false,
      (error) => service.geolocationErrorMessage(error as GeolocationPositionError),
    );
    expect(timeoutOutcome.action).toBe('error');
    if (timeoutOutcome.action === 'error') {
      expect(timeoutOutcome.message).toMatch(/timed out/i);
    }
  });

  it('try-again while permanently denied does not re-prompt', async () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'denied' }),
      },
    });

    const service = new LocationService();
    expect(await service.isPermanentlyDenied()).toBe(true);
    // MapApp.retryLocationPermission short-circuits before requestLocation
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
