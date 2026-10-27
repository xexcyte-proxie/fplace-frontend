import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocationService } from './location-service';

describe('LocationService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports unsupported when geolocation is missing', async () => {
    vi.stubGlobal('navigator', {});
    const service = new LocationService();
    expect(await service.queryPermission()).toBe('unsupported');
  });

  it('maps Permissions API states', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'denied' });
    vi.stubGlobal('navigator', {
      geolocation: {},
      permissions: { query },
    });
    const service = new LocationService();
    expect(await service.queryPermission()).toBe('denied');
    expect(await service.isPermanentlyDenied()).toBe(true);
    expect(query).toHaveBeenCalledWith({ name: 'geolocation' });
  });

  it('falls back to prompt when Permissions API is unavailable', async () => {
    vi.stubGlobal('navigator', { geolocation: {} });
    const service = new LocationService();
    expect(await service.queryPermission()).toBe('prompt');
  });

  it('returns coordinates from getCurrentPosition', async () => {
    const getCurrentPosition = vi.fn(
      (success: PositionCallback, _error?: PositionErrorCallback | null) => {
        success({
          coords: {
            latitude: 1.23,
            longitude: 4.56,
            accuracy: 8,
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
    });

    const service = new LocationService();
    await expect(service.requestLocation({ timeoutMs: 15_000 })).resolves.toEqual({
      latitude: 1.23,
      longitude: 4.56,
      accuracy: 8,
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ timeout: 15_000, enableHighAccuracy: true }),
    );
  });

  it('retries with relaxed accuracy when high-accuracy location times out', async () => {
    const timeout: GeolocationPositionError = {
      code: 3,
      message: 'Timeout expired',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    };
    const getCurrentPosition = vi.fn(
      (
        success: PositionCallback,
        error?: PositionErrorCallback | null,
      ) => {
        if (getCurrentPosition.mock.calls.length === 1) {
          error?.(timeout);
          return;
        }
        success({
          coords: {
            latitude: 6.72,
            longitude: 3.25,
            accuracy: 120,
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
    });

    const service = new LocationService();
    await expect(service.requestLocation()).resolves.toEqual({
      latitude: 6.72,
      longitude: 3.25,
      accuracy: 120,
    });
    expect(getCurrentPosition).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }),
    );
    expect(getCurrentPosition).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({
        enableHighAccuracy: false,
        timeout: 15_000,
        maximumAge: 60_000,
      }),
    );
  });

  it('streams live coordinates from watchPosition', () => {
    const watchPosition = vi.fn(
      (success: PositionCallback, _error?: PositionErrorCallback | null) => {
        success({
          coords: {
            latitude: 43.64,
            longitude: -79.38,
            accuracy: 6,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: 1,
          toJSON: () => ({}),
        });
        return 7;
      },
    );
    const clearWatch = vi.fn();
    vi.stubGlobal('navigator', {
      geolocation: { watchPosition, clearWatch },
    });

    const service = new LocationService();
    const onUpdate = vi.fn();
    const stop = service.watchLocation(onUpdate);

    expect(onUpdate).toHaveBeenCalledWith({
      latitude: 43.64,
      longitude: -79.38,
      accuracy: 6,
    });
    stop();
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('rejects when getCurrentPosition fails', async () => {
    const denied: GeolocationPositionError = {
      code: 1,
      message: 'denied',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    };
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error?: PositionErrorCallback | null) => {
        error?.(denied);
      },
    );
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition },
    });

    const service = new LocationService();
    await expect(service.requestLocation()).rejects.toBe(denied);
    expect(service.isPermissionDeniedError(denied)).toBe(true);
    expect(service.geolocationErrorMessage(denied)).toMatch(/denied/i);
  });
});
