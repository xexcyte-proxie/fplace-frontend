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
