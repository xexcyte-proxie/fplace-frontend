import { beforeEach, describe, expect, it, vi } from 'vitest';

const blueDotMock = vi.hoisted(() => {
  const instances: Array<{
    isEnabled: boolean;
    coordinate?: { latitude: number; longitude: number };
    enable: ReturnType<typeof vi.fn>;
    updateState: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  }> = [];

  class MockBlueDot {
    isEnabled = false;
    isFollowing = false;
    coordinate: { latitude: number; longitude: number } | undefined;
    enable = vi.fn(() => {
      this.isEnabled = true;
    });
    disable = vi.fn(() => {
      this.isEnabled = false;
    });
    updateState = vi.fn();
    update = vi.fn(
      (position?: { latitude?: number | string; longitude?: number | string }) => {
        if (
          typeof position?.latitude === 'number' &&
          typeof position.longitude === 'number'
        ) {
          this.coordinate = {
            latitude: position.latitude,
            longitude: position.longitude,
          };
        }
      },
    );
    reportPosition = vi.fn();
    watchDevicePosition = vi.fn();
    watchDeviceOrientation = vi.fn().mockResolvedValue(undefined);
    setPositionProcessor = vi.fn();
    follow = vi.fn();
    on = vi.fn();
    destroy = vi.fn();
    Sensors = {
      get: vi.fn(() => ({
        enable: vi.fn().mockResolvedValue(undefined),
        disable: vi.fn(),
      })),
    };

    constructor() {
      instances.push(this);
    }
  }

  return { instances, MockBlueDot };
});

vi.mock('@mappedin/blue-dot', () => ({
  BlueDot: blueDotMock.MockBlueDot,
}));

import { MapMarkerService } from './markers';

describe('MapMarkerService live navigation', () => {
  beforeEach(() => {
    blueDotMock.instances.length = 0;
    vi.clearAllMocks();
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => null),
      getElementById: vi.fn(() => null),
    });
  });

  it('restores the visible dot and directional glow after ambient boot', () => {
    const service = new MapMarkerService({} as never);
    const blueDot = blueDotMock.instances[0];

    service.prepare({ simulatorBoot: false });
    expect(blueDot.enable).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'transparent',
        heading: expect.objectContaining({ visible: false, opacity: 0 }),
      }),
    );

    service.setSimulatorParallelMode(true);

    expect(blueDot.updateState).toHaveBeenCalledWith(
      expect.objectContaining({
        visible: true,
        color: '#2266ff',
        heading: expect.objectContaining({
          visible: true,
          opacity: 0.7,
          color: '#2266ff',
          displayWhenInactive: true,
        }),
      }),
    );
  });

  it('applies a route-snapped live GPS fix even when raw accuracy is poor', () => {
    const service = new MapMarkerService({} as never);
    const blueDot = blueDotMock.instances[0];

    service.prepare({ simulatorBoot: false });
    service.setSimulatorParallelMode(true);
    service.applyProviderFrame({
      latitude: 43.4633,
      longitude: -80.5231,
      heading: 91,
      accuracy: 180,
      source: 'gps',
      floorId: 'main-floor',
      timestamp: Date.now(),
    });

    expect(blueDot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 43.4633,
        longitude: -80.5231,
        heading: 91,
        accuracy: 30,
        floorOrFloorId: 'main-floor',
      }),
      { animate: true },
    );
    expect(service.coordinate).toEqual({
      latitude: 43.4633,
      longitude: -80.5231,
    });
  });
});
