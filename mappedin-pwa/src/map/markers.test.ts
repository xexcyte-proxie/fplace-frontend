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
    setPositionProcessor: ReturnType<typeof vi.fn>;
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
        heading: expect.objectContaining({ visible: true, opacity: 0.85 }),
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
      { animate: false },
    );

    service.applyProviderFrame({
      latitude: 43.4634,
      longitude: -80.5232,
      heading: 94,
      accuracy: 40,
      source: 'gps',
      floorId: 'main-floor',
      timestamp: Date.now(),
    });

    expect(blueDot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 43.4634,
        longitude: -80.5232,
      }),
      { animate: true },
    );
    expect(service.coordinate).toEqual({
      latitude: 43.4634,
      longitude: -80.5232,
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
      'position-only',
      expect.objectContaining({ zoomLevel: 20 }),
    );
    expect(focusOn).toHaveBeenCalled();
  });

  it('follows heading during navigation but not on the idle map', () => {
    const idle = new MapMarkerService({} as never);
    const idleDot = blueDotMock.instances[0];
    idle.prepare({ simulatorBoot: false });
    idle.follow();
    idle.applyProviderFrame({
      latitude: 43.4633,
      longitude: -80.5231,
      heading: 91,
      accuracy: 12,
      source: 'gps',
      floorId: 'main-floor',
      timestamp: Date.now(),
    });
    expect(idleDot.follow).toHaveBeenLastCalledWith(
      'position-only',
      expect.objectContaining({ zoomLevel: 20 }),
    );

    const navigating = new MapMarkerService({} as never);
    const navDot = blueDotMock.instances[1];
    navigating.prepare({ simulatorBoot: false });
    navigating.setSimulatorParallelMode(true);
    navigating.follow();
    navigating.applyProviderFrame({
      latitude: 43.4633,
      longitude: -80.5231,
      heading: 91,
      accuracy: 12,
      source: 'gps',
      floorId: 'main-floor',
      timestamp: Date.now(),
    });
    expect(navDot.follow).toHaveBeenLastCalledWith(
      'position-and-heading',
      expect.objectContaining({ zoomLevel: 20 }),
    );
  });

  it('seeds the stationary filter from the last shown position', async () => {
    const service = new MapMarkerService({
      currentFloor: { id: 'main-floor' },
      createCoordinate: (latitude: number, longitude: number) => ({
        latitude,
        longitude,
      }),
      Camera: { focusOn: vi.fn() },
    } as never);
    const blueDot = blueDotMock.instances[0];

    service.showLivePosition({
      latitude: 6.5244,
      longitude: 3.3792,
      accuracy: 40,
      floorId: 'main-floor',
    });
    await service.startTracking({ watchDevicePosition: true });

    const processor = blueDot.setPositionProcessor.mock.calls.at(-1)?.[0] as (
      current: Record<string, unknown>,
      incoming: Record<string, unknown>,
    ) => Record<string, unknown> | undefined;

    const jitter = { latitude: 6.5245, longitude: 3.3792, accuracy: 40 };
    expect(processor({}, jitter)).toEqual(
      expect.objectContaining({
        latitude: 6.5244,
        longitude: 3.3792,
        heading: 'device',
      }),
    );
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

  it('holds stationary GPS jitter but passes real movement through', async () => {
    const service = new MapMarkerService({} as never);
    const blueDot = blueDotMock.instances[0];

    await service.startTracking({ watchDevicePosition: true });

    const processor = blueDot.setPositionProcessor.mock.calls.at(-1)?.[0] as (
      current: Record<string, unknown>,
      incoming: Record<string, unknown>,
    ) => Record<string, unknown> | undefined;
    expect(processor).toBeTypeOf('function');

    // First fix anchors the dot and keeps the compass cone (GPS heading is null
    // while stationary; forwarding that would hide Mappedin's glow).
    const first = { latitude: 6.5244, longitude: 3.3792, accuracy: 40 };
    expect(processor({}, first)).toEqual({ ...first, heading: 'device' });

    // ~11 m of drift with 40 m accuracy is noise: clamp back to the anchor.
    const jitter = { latitude: 6.5245, longitude: 3.3792, accuracy: 40 };
    expect(processor({}, jitter)).toEqual(
      expect.objectContaining({
        latitude: 6.5244,
        longitude: 3.3792,
        heading: 'device',
      }),
    );

    // ~33 m exceeds the 20 m threshold: real movement is applied.
    const walked = { latitude: 6.5247, longitude: 3.3792, accuracy: 40 };
    expect(processor({}, walked)).toEqual({ ...walked, heading: 'device' });

    // GPS course is travel direction, not facing: never put it on the cone.
    const withCourse = {
      latitude: 6.5249,
      longitude: 3.3792,
      accuracy: 40,
      heading: 91,
    };
    expect(processor({}, withCourse)).toEqual({
      ...withCourse,
      heading: 'device',
    });

    // Non-numeric ('device') coordinates bypass the filter untouched.
    const device = { latitude: 'device', longitude: 'device' };
    expect(processor({}, device)).toEqual(device);

    // Stopping tracking uninstalls the processor.
    service.stopTracking();
    expect(blueDot.setPositionProcessor).toHaveBeenLastCalledWith(undefined);
  });

  it('keeps the glow on device heading when a live GPS frame has none', () => {
    const service = new MapMarkerService({} as never);
    const blueDot = blueDotMock.instances[0];

    service.setSimulatorParallelMode(true, { compassGlow: true });
    service.applyProviderFrame({
      latitude: 43.4633,
      longitude: -80.5231,
      accuracy: 40,
      source: 'gps',
      floorId: 'main-floor',
      timestamp: Date.now(),
    });

    expect(blueDot.update).toHaveBeenCalledWith(
      expect.objectContaining({ heading: 'device' }),
      expect.anything(),
    );
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
