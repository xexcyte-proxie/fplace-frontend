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
});
