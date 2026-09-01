import { beforeEach, describe, expect, it, vi } from 'vitest';

const blueDotMock = vi.hoisted(() => {
  const instances: Array<{
    isEnabled: boolean;
    isFollowing: boolean;
    coordinate?: { latitude: number; longitude: number };
    enable: ReturnType<typeof vi.fn>;
    disable: ReturnType<typeof vi.fn>;
    updateState: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    follow: ReturnType<typeof vi.fn>;
    watchDevicePosition: ReturnType<typeof vi.fn>;
  }> = [];

  class MockBlueDot {
    isEnabled = false;
    isFollowing = false;
    coordinate: { latitude: number; longitude: number } | undefined;
    follow = vi.fn((mode?: unknown) => {
      this.isFollowing = mode !== false;
    });
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
          opacity: 0.85,
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

  it('shows a visible you-are-here marker and pans the camera', () => {
    const focusOn = vi.fn();
    const createCoordinate = vi.fn((latitude: number, longitude: number) => ({
      latitude,
      longitude,
    }));
    const service = new MapMarkerService({
      currentFloor: { id: 'main-floor' },
      createCoordinate,
      Camera: { focusOn },
    } as never);
    const blueDot = blueDotMock.instances[0];

    service.prepare({ simulatorBoot: true });
    expect(blueDot.disable).toHaveBeenCalled();

    service.showLivePosition(
      {
        latitude: 43.4634,
        longitude: -80.5232,
        accuracy: 12,
        floorId: 'main-floor',
      },
      { follow: true },
    );

    expect(blueDot.enable).toHaveBeenCalledWith(
      expect.objectContaining({
        visible: true,
        color: '#2266ff',
      }),
    );
    expect(blueDot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 43.4634,
        longitude: -80.5232,
        floorOrFloorId: 'main-floor',
      }),
      { animate: false },
    );
    expect(blueDot.follow).toHaveBeenCalledWith(
      'position-and-heading',
      expect.objectContaining({ zoomLevel: 20 }),
    );
    expect(focusOn).toHaveBeenCalled();
  });

  it('makes the marker visible when live GPS tracking starts after ambient boot', async () => {
    const service = new MapMarkerService({} as never);
    const blueDot = blueDotMock.instances[0];

    service.prepare({ simulatorBoot: false });
    await service.startTracking({ follow: true, watchDevicePosition: true });

    expect(blueDot.updateState).toHaveBeenCalledWith(
      expect.objectContaining({
        visible: true,
        color: '#2266ff',
      }),
    );
    expect(blueDot.watchDevicePosition).toHaveBeenCalledWith(true);
  });

  it('keeps a numeric heading so Mappedin does not hide the glow', async () => {
    const service = new MapMarkerService({} as never);
    const blueDot = blueDotMock.instances[0];

    service.prepare({ simulatorBoot: false });
    service.setSimulatorParallelMode(true);
    await service.enableHeading({ forceDuringSimulator: true });
    service.applyProviderFrame({
      latitude: 43.4633,
      longitude: -80.5231,
      heading: 91,
      accuracy: 8,
      source: 'gps',
      floorId: 'main-floor',
      timestamp: Date.now(),
    });

    const headings = blueDot.update.mock.calls
      .map((call) => (call[0] as { heading?: unknown } | undefined)?.heading)
      .filter((heading) => heading !== undefined);

    expect(headings).not.toContain('device');
    expect(headings.at(-1)).toBe(91);
  });

  it('keeps path heading until the compass settles', async () => {
    const service = new MapMarkerService({} as never);
    const blueDot = blueDotMock.instances[0];
    const orientationHandler = blueDot.on.mock.calls.find(
      ([event]) => event === 'device-orientation-update',
    )?.[1] as ((event: { heading: number }) => void) | undefined;

    service.setSimulatorParallelMode(true);
    await service.enableHeading({ forceDuringSimulator: true });
    orientationHandler?.({ heading: 12 });
    service.applyProviderFrame({
      latitude: 43.4633,
      longitude: -80.5231,
      heading: 91,
      accuracy: 8,
      source: 'simulator',
      floorId: 'main-floor',
      timestamp: Date.now(),
    });

    expect(blueDot.update).toHaveBeenCalledWith(
      expect.objectContaining({ heading: 91 }),
      expect.anything(),
    );
  });

  it('keeps path-travel heading on the cone during simulated walk', async () => {
    const service = new MapMarkerService({} as never);
    const blueDot = blueDotMock.instances[0];
    const orientationHandler = blueDot.on.mock.calls.find(
      ([event]) => event === 'device-orientation-update',
    )?.[1] as ((event: { heading: number }) => void) | undefined;

    service.setSimulatorParallelMode(true);
    await service.enableHeading({ forceDuringSimulator: true });
    for (let i = 0; i < 4; i++) {
      orientationHandler?.({ heading: 45 });
    }
    service.applyProviderFrame({
      latitude: 43.4633,
      longitude: -80.5231,
      heading: 91,
      accuracy: 8,
      source: 'simulator',
      floorId: 'main-floor',
      timestamp: Date.now(),
    });

    expect(blueDot.update).toHaveBeenCalledWith(
      expect.objectContaining({ heading: 91 }),
      expect.anything(),
    );
  });
});
