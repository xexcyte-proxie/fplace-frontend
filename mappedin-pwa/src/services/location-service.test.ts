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

  it('reports unknown when Permissions API is unavailable', async () => {
    vi.stubGlobal('navigator', { geolocation: {} });
    const service = new LocationService();
    expect(await service.queryPermission()).toBe('unknown');
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

  it.each([2, 3])('recovers from position error code %s without requiring browser constants', async (code) => {
    const timeout: GeolocationPositionError = {
      code,
      message: 'Timeout expired',
    } as GeolocationPositionError;
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
        timeout: 15_000,
        maximumAge: 10_000,
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

  it('shares concurrent acquisition and requests fresh data again after settlement', async () => {
    let success!: PositionCallback;
    const getCurrentPosition = vi.fn((ok: PositionCallback) => { success = ok; });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const service = new LocationService();
    const first = service.requestLocation({ maximumAgeMs: 0 });
    const second = service.requestLocation({ maximumAgeMs: 0 });
    expect(first).toBe(second);
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    success({ coords: { latitude: 1, longitude: 2, accuracy: 10 } } as GeolocationPosition);
    await first;
    const next = service.requestLocation({ maximumAgeMs: 0 });
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(getCurrentPosition.mock.calls[1]).toBeDefined();
    success({ coords: { latitude: 2, longitude: 3, accuracy: 10 } } as GeolocationPosition);
    await next;
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
    expect(service.geolocationErrorMessage(denied)).toMatch(/can’t access/i);
  });
});

describe('bounded acquisition and capabilities', () => {
  it('keeps initial prompt distinct from an unknown query', async () => {
    vi.stubGlobal('navigator', { geolocation: {}, permissions: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) } });
    expect(await new LocationService().queryPermission()).toBe('prompt');
    vi.unstubAllGlobals();
  });
  it('handles rejected queries and insecure contexts without acquiring location', async () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition }, permissions: { query: vi.fn().mockRejectedValue(new Error('unsupported')) } });
    expect(await new LocationService().queryPermission()).toBe('unknown');
    vi.stubGlobal('window', { isSecureContext: false });
    expect(await new LocationService().queryPermission()).toBe('unsupported');
    expect(getCurrentPosition).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('bounds a browser that never calls back, releases deduplication, and ignores a late success', async () => {
    vi.useFakeTimers();
    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    try {
      const service = new LocationService();
      const first = service.requestLocation({ timeoutMs: 100 });
      expect(service.requestLocation()).toBe(first);
      const assertion = expect(first).rejects.toMatchObject({ code: 3 });
      await vi.advanceTimersByTimeAsync(1100);
      expect(getCurrentPosition).toHaveBeenCalledOnce();
      await assertion;
      getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 1, longitude: 2, accuracy: 3 } });
      const retry = service.requestLocation({ timeoutMs: 100 });
      expect(retry).not.toBe(first);
      const rejection = expect(retry).rejects.toMatchObject({ code: 1 });
      getCurrentPosition.mock.calls[1][1]({ code: 1 });
      await rejection;
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
});
