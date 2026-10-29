import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GpsPositionProvider } from './gpsProvider';

describe('GpsPositionProvider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams each browser GPS fix with live coordinates and accuracy', () => {
    let handlePosition: PositionCallback | undefined;
    const watchPosition = vi.fn(
      (
        success: PositionCallback,
        _error?: PositionErrorCallback | null,
        _options?: PositionOptions,
      ) => {
        handlePosition = success;
        return 7;
      },
    );
    const clearWatch = vi.fn();

    vi.stubGlobal('navigator', {
      geolocation: { watchPosition, clearWatch },
    });
    vi.stubGlobal('DeviceOrientationEvent', undefined);

    const provider = new GpsPositionProvider();
    const onFrame = vi.fn();
    provider.start(onFrame);

    handlePosition?.({
      coords: {
        latitude: 43.4633,
        longitude: -80.5231,
        accuracy: 180,
        altitude: null,
        altitudeAccuracy: null,
        heading: 91,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    });

    expect(watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
    expect(onFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 43.4633,
        longitude: -80.5231,
        heading: 91,
        accuracy: 180,
        source: 'gps',
      }),
    );

    provider.stop();
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('omits heading until compass or GPS course is available', () => {
    let handlePosition: PositionCallback | undefined;
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: vi.fn(
          (success: PositionCallback) => {
            handlePosition = success;
            return 1;
          },
        ),
        clearWatch: vi.fn(),
      },
    });
    vi.stubGlobal('DeviceOrientationEvent', undefined);

    const provider = new GpsPositionProvider();
    const onFrame = vi.fn();
    provider.start(onFrame);

    handlePosition?.({
      coords: {
        latitude: 43.4633,
        longitude: -80.5231,
        accuracy: 40,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    });

    expect(onFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 43.4633,
        longitude: -80.5231,
        accuracy: 40,
        source: 'gps',
      }),
    );
    expect(onFrame.mock.calls[0][0].heading).toBeUndefined();

    provider.stop();
  });

  it('forwards every GPS fix so 2D navigation can follow in realtime', () => {
    let handlePosition: PositionCallback | undefined;
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: vi.fn((success: PositionCallback) => {
          handlePosition = success;
          return 1;
        }),
        clearWatch: vi.fn(),
      },
    });
    vi.stubGlobal('DeviceOrientationEvent', undefined);

    const provider = new GpsPositionProvider();
    const onFrame = vi.fn();
    provider.start(onFrame);

    const fix = (
      latitude: number,
      longitude: number,
      accuracy: number,
    ): GeolocationPosition =>
      ({
        coords: {
          latitude,
          longitude,
          accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      }) as GeolocationPosition;

    handlePosition?.(fix(6.5244, 3.3792, 40));
    handlePosition?.(fix(6.5245, 3.3792, 40));
    handlePosition?.(fix(6.5247, 3.3792, 40));

    expect(onFrame.mock.calls[0][0]).toEqual(
      expect.objectContaining({ latitude: 6.5244, longitude: 3.3792 }),
    );
    expect(onFrame.mock.calls[1][0]).toEqual(
      expect.objectContaining({ latitude: 6.5245, longitude: 3.3792, accuracy: 40 }),
    );
    expect(onFrame.mock.calls[2][0]).toEqual(
      expect.objectContaining({ latitude: 6.5247, longitude: 3.3792 }),
    );

    provider.stop();
  });
});

describe('GPS errors and late callbacks', () => {
  it('reports permission errors and ignores callbacks from a stopped session', () => {
    let success!: PositionCallback;
    let error!: PositionErrorCallback;
    vi.stubGlobal('navigator', { geolocation: {
      watchPosition: vi.fn((s: PositionCallback, e: PositionErrorCallback) => { success = s; error = e; return 1; }),
      clearWatch: vi.fn(),
    } });
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    const provider = new GpsPositionProvider();
    const onStatus = vi.fn();
    const onFrame = vi.fn();
    provider.start(onFrame, { onStatus });
    error({ code: 1, message: 'Denied' } as GeolocationPositionError);
    expect(onStatus).toHaveBeenLastCalledWith('error');
    const oldSuccess = success;
    provider.stop();
    provider.start(onFrame, { onStatus });
    oldSuccess({ coords: { latitude: 6.6, longitude: 3.35, accuracy: 5 }, timestamp: Date.now() } as GeolocationPosition);
    expect(onFrame).not.toHaveBeenCalled();
    success({ coords: { latitude: 6.6, longitude: 3.35, accuracy: 5 }, timestamp: Date.now() } as GeolocationPosition);
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith('active');
    provider.stop();
    vi.unstubAllGlobals();
  });
});


describe('retained GPS and compass independence', () => {
  it('keeps compass updates after a watch timeout without making the old GPS fix fresh or active', async () => {
    vi.useFakeTimers();
    let success!: PositionCallback; let fail!: PositionErrorCallback;
    const listeners = new Map<string, (event: any) => void>();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: vi.fn((s: PositionCallback, e: PositionErrorCallback) => { success = s; fail = e; return 1; }), clearWatch: vi.fn() } });
    vi.stubGlobal('DeviceOrientationEvent', class {});
    vi.stubGlobal('window', { screen: { orientation: { angle: 0 } }, addEventListener: (event: string, callback: (event: any) => void) => listeners.set(event, callback), removeEventListener: vi.fn() });
    const provider = new GpsPositionProvider(); const onStatus = vi.fn(); const onFrame = vi.fn();
    try {
      provider.start(onFrame, { onStatus });
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      const timestamp = Date.now();
      success({ coords: { latitude: 6, longitude: 3, accuracy: 35, heading: null }, timestamp } as GeolocationPosition);
      fail({ code: 3, message: 'Timeout' } as GeolocationPositionError);
      vi.advanceTimersByTime(16_000);
      const beforeTurn = onStatus.mock.calls.length;
      const turn = listeners.get('deviceorientation')!;
      turn({ webkitCompassHeading: 90, webkitCompassAccuracy: 5 });
      turn({ webkitCompassHeading: 90, webkitCompassAccuracy: 5 });
      expect(onFrame).toHaveBeenLastCalledWith(expect.objectContaining({ headingOnly: true, heading: 90, latitude: 6, longitude: 3, timestamp }));
      expect(onStatus.mock.calls.length).toBe(beforeTurn);
      expect(onStatus).toHaveBeenLastCalledWith('inactive');
      success({ coords: { latitude: 6.0001, longitude: 3, accuracy: 5, heading: null }, timestamp: Date.now() } as GeolocationPosition);
      expect(onFrame.mock.calls.at(-1)?.[0].headingOnly).toBeUndefined();
      expect(onStatus).toHaveBeenLastCalledWith('active');
    } finally { provider.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
});
