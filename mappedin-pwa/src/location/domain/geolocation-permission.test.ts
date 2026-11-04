import { describe, expect, it } from 'vitest';

import {
  coordinatesFromPosition,
  isGeolocationPermissionDenied,
  isGeolocationPositionError,
  isPermissionDeniedError,
} from './geolocation-permission';
import {
  isLocationGateAuthStep,
  nextMarketingOnboardingStep,
  resolveLocationGateEntry,
  resolveLocationGateFailure,
  resolveLocationGatePreflight,
} from './location-gate';

function fakePosition(
  latitude: number,
  longitude: number,
  accuracy: number | null = 12,
): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: accuracy as number,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}

function fakeGeoError(code: number): GeolocationPositionError {
  return {
    code,
    message: 'geo error',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}

describe('coordinatesFromPosition', () => {
  it('maps browser coords into domain coordinates', () => {
    expect(coordinatesFromPosition(fakePosition(43.1, -80.2, 5))).toEqual({
      latitude: 43.1,
      longitude: -80.2,
      accuracy: 5,
    });
  });
});

describe('permission helpers', () => {
  it('detects denied permission state', () => {
    expect(isGeolocationPermissionDenied('denied')).toBe(true);
    expect(isGeolocationPermissionDenied('prompt')).toBe(false);
  });

  it('detects GeolocationPositionError permission denied', () => {
    const denied = fakeGeoError(1);
    expect(isGeolocationPositionError(denied)).toBe(true);
    expect(isPermissionDeniedError(denied)).toBe(true);
    expect(isPermissionDeniedError(fakeGeoError(2))).toBe(false);
    expect(isPermissionDeniedError(new Error('nope'))).toBe(false);
  });
});

describe('resolveLocationGatePreflight', () => {
  it('blocks permanently denied browsers without prompting', () => {
    expect(resolveLocationGatePreflight('denied')).toEqual({
      action: 'required-permanent',
    });
  });

  it('routes unsupported geolocation to error', () => {
    expect(resolveLocationGatePreflight('unsupported')).toEqual({
      action: 'error-unsupported',
    });
  });

  it('allows granted and prompt states to request a fix', () => {
    expect(resolveLocationGatePreflight('granted')).toEqual({
      action: 'request',
    });
    expect(resolveLocationGatePreflight('prompt')).toEqual({
      action: 'request',
    });
  });
});

describe('resolveLocationGateEntry', () => {
  it('silently reuses a browser grant without showing Enable Location', () => {
    expect(resolveLocationGateEntry('granted', 'undecided')).toEqual({
      action: 'silent-request',
    });
  });

  it('skips GPS after the user already denied, including Safari prompt state', () => {
    expect(resolveLocationGateEntry('denied', 'undecided')).toEqual({
      action: 'skip',
    });
    expect(resolveLocationGateEntry('prompt', 'denied')).toEqual({
      action: 'skip',
    });
  });

  it('silently retries when Safari cannot query but we remember a grant', () => {
    expect(resolveLocationGateEntry('prompt', 'granted')).toEqual({
      action: 'silent-request',
    });
  });

  it('shows Enable Location only before the first choice', () => {
    expect(resolveLocationGateEntry('prompt', 'undecided')).toEqual({
      action: 'prompt',
    });
  });
});

describe('resolveLocationGateFailure', () => {
  it('maps permission denial to the required screen', () => {
    expect(
      resolveLocationGateFailure(fakeGeoError(1), true, () => 'ignored'),
    ).toEqual({ action: 'required', permanentlyDenied: true });
  });

  it('maps other failures to the location error screen', () => {
    expect(
      resolveLocationGateFailure(fakeGeoError(2), false, () => 'unavailable'),
    ).toEqual({ action: 'error', message: 'unavailable' });
  });
});

describe('startup marketing + location step helpers', () => {
  it('walks Welcome → Introduction → Features → Create Account', () => {
    expect(nextMarketingOnboardingStep('none')).toBe('introduction');
    expect(nextMarketingOnboardingStep('introduction')).toBe('features');
    expect(nextMarketingOnboardingStep('features')).toBe('create');
    expect(nextMarketingOnboardingStep('create')).toBeNull();
  });

  it('identifies location gate auth steps', () => {
    expect(isLocationGateAuthStep('location-permission')).toBe(true);
    expect(isLocationGateAuthStep('location-required')).toBe(true);
    expect(isLocationGateAuthStep('location-error')).toBe(true);
    expect(isLocationGateAuthStep('venue-select')).toBe(false);
  });
});

describe('reliable failure classification', () => {
  it.each([
    [1, 'denied', 'denied'], [1, 'granted', 'restricted'], [1, 'unknown', 'restricted'],
    [2, 'granted', 'unavailable'], [2, 'unknown', 'restricted'],
    [3, 'granted', 'timeout'], [3, 'prompt', 'timeout'], [2, 'unsupported', 'unsupported'],
  ] as const)('code %s with %s permission is %s', async (code, permission, expected) => {
    const { classifyLocationFailure } = await import('./geolocation-permission');
    expect(classifyLocationFailure({ code }, permission)).toBe(expected);
  });
});
