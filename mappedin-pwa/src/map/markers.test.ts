import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    vi.stubGlobal('DeviceOrientationEvent', class {});
    blueDotMock.instances.length = 0;
    vi.clearAllMocks();
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => null),
      getElementById: vi.fn(() => null),
    });
  });

  it('keeps ambient boot invisible so GPS does not look like a start pin', () => {
    const service = new MapMarkerService({} as never);
    const blueDot = blueDotMock.instances[0];

    service.prepare({ simulatorBoot: false });
    expect(blueDot.enable).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'transparent',
        visible: false,
        heading: expect.objectContaining({ visible: false }),
        accuracyRing: expect.objectContaining({ visible: false }),
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

  it('preserves reported uncertainty for approximate map display', () => {
    const service = new MapMarkerService({} as never);
    const blueDot = blueDotMock.instances[0];

    service.prepare({ simulatorBoot: false });
    service.setSimulatorParallelMode(true);
    service.applyProviderFrame({
      latitude: 43.4633,
      longitude: -80.5231,
      heading: 91,
      accuracy: 35,
      source: 'gps',
      floorId: 'main-floor',
      timestamp: Date.now(),
    });

    expect(blueDot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 43.4633,
        longitude: -80.5231,
        heading: 91,
        accuracy: 35,
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
    const processedJitter = processor({}, jitter);
    expect(processedJitter).toEqual(
      expect.objectContaining({
        latitude: 6.5244,
        longitude: 3.3792,
      }),
    );
    expect(processedJitter).not.toHaveProperty('heading');
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

    // First fix anchors the dot. Heading is omitted until compass provides a
    // numeric value; the BlueDot SDK rejects string sentinels.
    const first = { latitude: 6.5244, longitude: 3.3792, accuracy: 40 };
    expect(processor({}, first)).toEqual(first);

    // ~11 m of drift with 40 m accuracy is noise: clamp back to the anchor.
    const jitter = { latitude: 6.5245, longitude: 3.3792, accuracy: 40 };
    const processedJitter = processor({}, jitter);
    expect(processedJitter).toEqual(
      expect.objectContaining({
        latitude: 6.5244,
        longitude: 3.3792,
      }),
    );
    expect(processedJitter).not.toHaveProperty('heading');

    // ~33 m exceeds the 20 m threshold: real movement is applied.
    const walked = { latitude: 6.5247, longitude: 3.3792, accuracy: 40 };
    expect(processor({}, walked)).toEqual(walked);

    // GPS course is travel direction, not facing: never put it on the cone.
    const withCourse = {
      latitude: 6.5249,
      longitude: 3.3792,
      accuracy: 40,
      heading: 91,
    };
    const processedCourse = processor({}, withCourse);
    expect(processedCourse).toEqual({
      latitude: withCourse.latitude,
      longitude: withCourse.longitude,
      accuracy: withCourse.accuracy,
    });
    expect(processedCourse).not.toHaveProperty('heading');

    // Non-numeric ('device') coordinates bypass the filter untouched.
    const device = { latitude: 'device', longitude: 'device' };
    expect(processor({}, device)).toEqual(device);

    // Stopping tracking uninstalls the processor.
    service.stopTracking();
    expect(blueDot.setPositionProcessor).toHaveBeenLastCalledWith(undefined);
  });

  it('omits heading when a live GPS frame has none', () => {
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
      expect.not.objectContaining({ heading: expect.anything() }),
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

describe('blue dot rendering lifecycle regressions', () => {
  beforeEach(() => {
    vi.stubGlobal('DeviceOrientationEvent', class {});
    blueDotMock.instances.length = 0; vi.clearAllMocks();
    vi.stubGlobal('document', { querySelector: vi.fn(() => null), getElementById: vi.fn(() => null) });
  });
  it('restores a disabled dot only when an actual finite provider coordinate arrives', () => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0];
    service.setSimulatorParallelMode(true); dot.disable(); dot.enable.mockClear();
    service.applyProviderFrame({ latitude:NaN, longitude:3, accuracy:5, source:'gps' });
    expect(dot.enable).not.toHaveBeenCalled(); expect(dot.update).not.toHaveBeenCalled();
    service.applyProviderFrame({ latitude:6, longitude:3, accuracy:5, source:'gps' });
    expect(dot.enable).toHaveBeenCalledWith(expect.objectContaining({ visible:true }));
    expect(dot.update).toHaveBeenCalledWith(expect.objectContaining({ latitude:6, longitude:3 }), { animate:false });
  });
  it.each(['destroy', 'provider-takeover'])('does not start a late native GPS watch after %s', async change => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0] as any;
    let resolve!: () => void;
    const sensor={ enable:vi.fn(() => new Promise<void>(r => { resolve=r; })), disable:vi.fn() };
    dot.Sensors.get.mockReturnValue(sensor);
    const pending=service.startTracking();
    if(change === 'destroy') service.destroy(); else service.setSimulatorParallelMode(true);
    resolve(); await pending;
    expect(dot.watchDevicePosition).not.toHaveBeenCalledWith(true); expect(service.isTracking).toBe(false);
  });
  it('coalesces concurrent start requests into one native GPS subscription', async () => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0] as any;
    let resolve!: () => void;
    const gps={ enable:vi.fn(() => new Promise<void>(r => { resolve=r; })), disable:vi.fn() };
    dot.Sensors.get.mockImplementation((name: string)=>name==='geolocation'?gps:{ enable:vi.fn(async()=>{}), disable:vi.fn() });
    const one=service.startTracking(), two=service.startTracking(); resolve(); await Promise.all([one,two]);
    expect(gps.enable).toHaveBeenCalledOnce(); expect(dot.watchDevicePosition).toHaveBeenCalledTimes(1);
  });
});


describe('clearing route chrome retains the actual location', () => {
  it('does not disable the dot or inject a replacement coordinate', () => {
    vi.stubGlobal('document', { querySelector: () => null, getElementById: () => null });
    const service = new MapMarkerService({} as never);
    const dot = blueDotMock.instances.at(-1)!;
    service.setSimulatorParallelMode(true);
    service.applyProviderFrame({ latitude:6, longitude:3, accuracy:5, source:'gps' });
    dot.disable.mockClear(); dot.update.mockClear();
    service.resetNavigationDisplay();
    expect(dot.disable).not.toHaveBeenCalled(); expect(dot.update).not.toHaveBeenCalled();
    expect(dot.coordinate).toEqual({ latitude:6, longitude:3 });
  });
});


describe('read-only location console diagnostics', () => {
  it('reports real SDK coordinates, visibility, floor mismatch and distance without moving the marker', () => {
    vi.stubGlobal('document', { querySelector: () => null, getElementById: () => null });
    const service = new MapMarkerService({ currentFloor: { id: 'ground' } } as never);
    const dot = blueDotMock.instances.at(-1)! as any;
    dot.coordinate = { latitude: 6, longitude: 3, floorId: 'upper' };
    dot.floor = { id: 'upper' }; dot.status = 'hidden'; dot.accuracy = 8;
    dot.getState = vi.fn(() => ({ visible: true, color: '#2266ff' }));
    dot.update.mockClear(); dot.updateState.mockClear(); dot.follow.mockClear();
    expect(service.getLocationDiagnosticSnapshot({ latitude: 6, longitude: 3 })).toMatchObject({
      sdkCoordinate: { latitude: 6, longitude: 3, floorId: 'upper' }, sdkStatus: 'hidden',
      configuredVisible: true, sdkAccuracyMeters: 8, floorMatchesView: false,
      differenceFromExpectedMeters: 0, matchesExpectedWithin1cm: true,
    });
    const displaced = service.getLocationDiagnosticSnapshot({ latitude: 6.0001, longitude: 3 });
    expect(displaced?.differenceFromExpectedMeters).toBeGreaterThan(11);
    expect(displaced?.matchesExpectedWithin1cm).toBe(false);
    expect(dot.update).not.toHaveBeenCalled(); expect(dot.updateState).not.toHaveBeenCalled(); expect(dot.follow).not.toHaveBeenCalled();
    dot.getState.mockClear();
    vi.stubEnv('DEV', false);
    try {
      expect(service.getLocationDiagnosticSnapshot()).toBeNull();
      expect(dot.getState).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });
});


describe('existing compass glow lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('DeviceOrientationEvent', class {});
    blueDotMock.instances.length = 0; vi.clearAllMocks();
    vi.stubGlobal('document', { querySelector: () => null, getElementById: () => null });
  });
  const orientation = (dot: any) => dot.on.mock.calls.find(([name]: [string]) => name === 'device-orientation-update')[1] as (event: { heading: number }) => void;
  it('retains the original glow and world heading through simulation, map rotation and route cleanup without moving GPS', async () => {
    const view = { currentFloor: { id: 'ground' }, Camera: { bearing: 0 } };
    const service = new MapMarkerService(view as never);
    const dot = blueDotMock.instances[0];
    const onPosition = vi.fn(), onAnimatedPosition = vi.fn();
    service.attachHandlers({ onPosition, onAnimatedPosition });
    service.setSimulatorParallelMode(true, { compassGlow: true });
    await service.enableHeading({ forceDuringSimulator: true });
    expect(dot.watchDeviceOrientation).toHaveBeenCalledTimes(1);
    service.applyProviderFrame({ latitude: 6, longitude: 3, accuracy: 5, source: 'gps', floorId: 'ground' });
    dot.update.mockClear(); dot.watchDeviceOrientation.mockClear();
    const turn = orientation(dot);
    turn({ heading: 45 }); turn({ heading: 45 });
    expect(dot.update).toHaveBeenLastCalledWith({ heading: 45 }, { silent: true, animate: false });
    view.Camera.bearing = 90;
    turn({ heading: 45 });
    expect(dot.update).toHaveBeenLastCalledWith({ heading: 45 }, { silent: true, animate: false });
    service.resetNavigationDisplay();
    expect(dot.watchDeviceOrientation).not.toHaveBeenCalledWith(false);
    expect(dot.updateState).not.toHaveBeenCalledWith({ heading: { visible: false, opacity: 0 } });
    turn({ heading: 90 });
    const headings = dot.update.mock.calls.map(([value]: any) => value);
    expect(headings.every(value => Object.keys(value).every(key => key === 'heading'))).toBe(true);
    expect(headings.at(-1).heading).toBeGreaterThan(45);
    expect(headings.at(-1).heading).toBeLessThan(90);
    expect(dot.coordinate).toEqual({ latitude: 6, longitude: 3 });
    expect(service.getLastPosition()?.coordinate).toMatchObject({ latitude: 6, longitude: 3 });
    expect(onPosition).not.toHaveBeenCalled(); expect(onAnimatedPosition).not.toHaveBeenCalled();
    expect(dot.updateState).toHaveBeenCalledWith({ heading: { visible: true, opacity: .85, color: '#2266ff', displayWhenInactive: true } });
  });
  it('restarts heading after stop/start in the same provider mode', async () => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0];
    service.setSimulatorParallelMode(true, { compassGlow: true });
    await service.enableHeading(); service.stopTracking(); dot.watchDeviceOrientation.mockClear();
    service.setSimulatorParallelMode(true, { compassGlow: true });
    await service.enableHeading();
    expect(dot.watchDeviceOrientation).toHaveBeenCalledWith(true);
    expect(service.getLocationDiagnosticSnapshot()?.compass.enabled).toBe(true);
  });
  it('preserves the renderer and native compass when leaving provider-driven navigation', async () => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0];
    service.setSimulatorParallelMode(true, { compassGlow: true }); await service.enableHeading();
    dot.watchDeviceOrientation.mockClear(); dot.disable.mockClear();
    service.setSimulatorParallelMode(false);
    await service.startTracking({ watchDevicePosition: true });
    expect(dot.disable).not.toHaveBeenCalled();
    expect(dot.watchDeviceOrientation).not.toHaveBeenCalledWith(false);
    expect(service.getLocationDiagnosticSnapshot()?.compass.enabled).toBe(true);
  });
  it('uses existing provider heading updates while the preferred compass is unavailable', async () => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0] as any;
    dot.Sensors.get.mockImplementation(() => ({ enable: vi.fn().mockRejectedValue(Error('Permission denied')), disable: vi.fn() }));
    service.setSimulatorParallelMode(true, { compassGlow: true });
    await service.enableHeading(); dot.update.mockClear();
    service.applyHeadingOnly(90);
    expect(dot.update).toHaveBeenCalledWith({ heading: 90 }, { silent: true, animate: false });
    expect(service.getLocationDiagnosticSnapshot()?.compass.enabled).toBe(false);
  });
  it('does not let late heading disable hide a newly restarted glow', async () => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0];
    await service.enableHeading();
    let release!: () => void;
    dot.watchDeviceOrientation.mockImplementation((enabled: boolean) => enabled ? Promise.resolve() : new Promise<void>(resolve => { release = resolve; }));
    const disabling = service.disableHeading();
    await service.enableHeading(); dot.updateState.mockClear();
    release(); await disabling;
    expect(dot.updateState).not.toHaveBeenCalledWith({ heading: { visible: false, opacity: 0 } });
    expect(service.getLocationDiagnosticSnapshot()?.compass.enabled).toBe(true);
  });
  it('retains the accepted coordinate and compass on signal loss without submitting a fabricated fix', async () => {
    const service = new MapMarkerService({ currentFloor: { id: 'ground' } } as never);
    const dot = blueDotMock.instances[0];
    service.setSimulatorParallelMode(true, { compassGlow: true }); await service.enableHeading();
    service.showLivePosition({ latitude: 40, longitude: -80, accuracy: 35, floorId: 'ground' }, { follow: false });
    dot.update.mockClear(); dot.disable.mockClear();
    const acceptedAt = service.getLocationDiagnosticSnapshot()?.lastPositionReceivedAt;
    service.setPositionAvailability('retained');
    expect(dot.update).not.toHaveBeenCalled(); expect(dot.disable).not.toHaveBeenCalled();
    expect(dot.updateState).toHaveBeenLastCalledWith({ color: '#64748b' });
    expect(service.getLocationDiagnosticSnapshot()).toMatchObject({ positionAvailability: 'retained', lastPositionReceivedAt: acceptedAt,
      reportedAccuracyMeters: 35, applicationCoordinate: { latitude: 40, longitude: -80, floorId: 'ground' } });
    const turn = orientation(dot); turn({ heading: 60 }); turn({ heading: 60 });
    expect(dot.update).toHaveBeenLastCalledWith({ heading: 60 }, { silent: true, animate: false });
    expect(dot.coordinate).toEqual({ latitude: 40, longitude: -80 });
    service.applySimulatorFrame({ latitude: 40.0001, longitude: -80, accuracy: 5, timestamp: Date.now(), source: 'gps', floorId: 'ground' });
    expect(service.getLocationDiagnosticSnapshot()?.positionAvailability).toBe('live');
    expect(dot.updateState).toHaveBeenLastCalledWith({ color: '#2266ff' });
  });

  it('keeps accepted provider metadata and avoids reanimating a held fix after SDK interpolation callbacks', () => {
    const service = new MapMarkerService({ currentFloor: { id: 'ground' } } as never);
    const dot = blueDotMock.instances[0]; service.setSimulatorParallelMode(true);
    const frame = { latitude: 40, longitude: -80, accuracy: 5, heading: 60, timestamp: Date.now(), source: 'gps' as const, floorId: 'ground' };
    service.applyProviderFrame(frame);
    const callback = (dot.on as any).mock.calls.find(([name]: any) => name === 'dot-position-update')[1];
    callback({ position: { latitude: 40.000001, longitude: -80 } });
    expect(service.getLastPosition()).toMatchObject({ coordinate: { latitude: 40, longitude: -80, floorId: 'ground' }, accuracy: 5, heading: 60 });
    dot.update.mockClear(); service.applyProviderFrame(frame);
    expect(dot.update).toHaveBeenCalledWith(expect.objectContaining({ latitude: 40, longitude: -80 }), { animate: false });
  });

});


describe('absolute compass independent of GPS and SDK active status', () => {
  let listeners: Map<string, (event: any) => void>;
  beforeEach(() => {
    blueDotMock.instances.length = 0; vi.clearAllMocks(); listeners = new Map();
    vi.stubGlobal('DeviceOrientationEvent', class {});
    vi.stubGlobal('document', { querySelector: () => null, getElementById: () => null });
    vi.stubGlobal('window', { screen: { orientation: { angle: 0 } }, addEventListener: (name: string, callback: any) => listeners.set(name, callback), removeEventListener: vi.fn() });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('keeps the original cone rotating on a retained inactive marker without GPS, route or SDK heading callbacks', async () => {
    const service = new MapMarkerService({ currentFloor: { id: 'ground' }, Camera: { bearing: 90 } } as never);
    const dot = blueDotMock.instances[0] as any;
    service.setSimulatorParallelMode(true, { compassGlow: true }); await service.enableHeading();
    const turn = listeners.get('deviceorientation')!;
    // A facing direction may settle before any physical location has been obtained.
    turn({ webkitCompassHeading: 120, webkitCompassAccuracy: 5 }); turn({ webkitCompassHeading: 120, webkitCompassAccuracy: 5 });
    service.showLivePosition({ latitude: 40, longitude: -80, accuracy: 5, floorId: 'ground' }, { follow: false });
    expect(dot.update).toHaveBeenCalledWith(expect.objectContaining({ heading: 120, latitude: 40 }), { animate: false });
    dot.status = 'inactive'; service.setPositionAvailability('retained'); dot.update.mockClear();
    turn({ webkitCompassHeading: 150, webkitCompassAccuracy: 5 });
    expect(dot.update).toHaveBeenLastCalledWith({ heading: expect.any(Number) }, { silent: true, animate: false });
    expect(service.getLocationDiagnosticSnapshot()).toMatchObject({ positionAvailability: 'retained',
      applicationCoordinate: { latitude: 40, longitude: -80 }, compass: { rawListenerActive: true, source: 'raw-absolute-compass', fresh: true } });
    expect(dot.coordinate).toEqual({ latitude: 40, longitude: -80 });
    expect(service.getLocationDiagnosticSnapshot()!.compass.expectedVisualHeading).toBeCloseTo(38.4);
    service.stopTracking(); expect(window.removeEventListener).toHaveBeenCalledTimes(2);
  });
  it('rejects relative, missing and unreliable orientation without inventing north', async () => {
    const service = new MapMarkerService({} as never); await service.enableHeading();
    const turn = listeners.get('deviceorientation')!;
    for (const sample of [{ alpha: 10, absolute: false }, { alpha: null, absolute: true }, { webkitCompassHeading: 90, webkitCompassAccuracy: -1 }]) { turn(sample); turn(sample); }
    expect(service.getLocationDiagnosticSnapshot()!.compass.deviceHeading).toBeNull();
    expect(service.getLocationDiagnosticSnapshot()!.compass.locked).toBe(false);
    service.stopTracking();
  });
  it('does not report an SDK sensor that resolves denial as enabled', async () => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0] as any;
    dot.Sensors.get.mockReturnValue({ enable: vi.fn(async () => 'denied'), disable: vi.fn() });
    await service.enableHeading();
    expect(service.getLocationDiagnosticSnapshot()!.compass).toMatchObject({ enabled: false, permission: 'denied', rawListenerActive: false, startupError: 'SDK orientation sensor: denied' });
  });
  it('requests iOS permission in the click stack and can retry a denial', async () => {
    let release!: (state: string) => void;
    const permission = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    vi.stubGlobal('DeviceOrientationEvent', class { static requestPermission = permission; });
    const service = new MapMarkerService({} as never);
    const first = service.enableHeading(); expect(permission).toHaveBeenCalledOnce();
    release('denied'); await first;
    expect(service.getLocationDiagnosticSnapshot()!.compass.enabled).toBe(false);
    const second = service.enableHeading(); expect(permission).toHaveBeenCalledTimes(2);
    release('granted'); await second;
    expect(service.getLocationDiagnosticSnapshot()!.compass.enabled).toBe(true);
    service.stopTracking();
  });
  it('does not substitute GPS travel course for phone-facing direction in live compass mode', async () => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0];
    service.setSimulatorParallelMode(true, { compassGlow: true }); await service.enableHeading();
    service.applyProviderFrame({ latitude: 40, longitude: -80, accuracy: 5, heading: 180, source: 'gps' });
    expect(dot.update.mock.calls.find(([value]: any) => value.latitude === 40)?.[0]).not.toHaveProperty('heading');
    const turn = listeners.get('deviceorientation')!;
    turn({ webkitCompassHeading: 60, webkitCompassAccuracy: 5 }); turn({ webkitCompassHeading: 60, webkitCompassAccuracy: 5 });
    dot.update.mockClear();
    service.applyProviderFrame({ latitude: 40, longitude: -80, accuracy: 5, heading: 180, source: 'gps' });
    expect(dot.update).toHaveBeenCalledWith(expect.objectContaining({ latitude: 40, heading: 60 }), expect.anything());
    service.stopTracking();
  });
  it('keeps original native fix timestamps and uncertainty through SDK animation callbacks', async () => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0] as any;
    const accepted = vi.fn(); service.attachHandlers({ onPosition: accepted });
    await service.startTracking();
    const processor = dot.setPositionProcessor.mock.calls.at(-1)[0];
    const timestamp = Date.now() - 1000;
    processor({}, { latitude: 6, longitude: 3, accuracy: 40, timestamp });
    const native = dot.on.mock.calls.find(([name]: any) => name === 'position-update')[1];
    native({ coordinate: { latitude: 6, longitude: 3 }, accuracy: 40 });
    expect(accepted).toHaveBeenLastCalledWith(expect.objectContaining({ timestamp, accuracy: 40 }));
    const animated = dot.on.mock.calls.find(([name]: any) => name === 'dot-position-update')[1];
    animated({ position: { latitude: 6, longitude: 3 } });
    expect(service.getLastPosition()).toMatchObject({ timestamp, accuracy: 40 });
    service.stopTracking();
  });

});
