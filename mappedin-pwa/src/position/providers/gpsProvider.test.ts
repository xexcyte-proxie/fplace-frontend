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
