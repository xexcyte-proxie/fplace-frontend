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
  it('keeps demo heading alive beyond the SDK position timeout without GPS updates', async () => {
    vi.useFakeTimers();
    const service = new MapMarkerService({} as never);
    const dot = blueDotMock.instances[0] as any;
    const diagnostic = vi.fn();
    try {
      service.setHeadingDiagnostics(diagnostic);
      service.setSimulatorParallelMode(true, { compassGlow: true });
      await service.enableHeading({ forceDuringSimulator: true });
      service.applyProviderFrame({ latitude: 43, longitude: -80, accuracy: 4,
        source: 'physical-gps-transformed', floorId: 'g', timestamp: Date.now() });
      expect(dot.enable).toHaveBeenCalledWith(expect.objectContaining({ timeout: Infinity }));
      const handler = dot.on.mock.calls.find(([event]: [string]) => event === 'device-orientation-update')[1];
      const positionCalls = vi.fn(); service.attachHandlers({ onPosition: positionCalls, onAnimatedPosition: positionCalls });
      handler({ heading: 30 }); handler({ heading: 30 });
      const before = { ...service.getLastPosition()!.coordinate };
      const coordinateCalls = dot.update.mock.calls.filter(([value]: any[]) => value.latitude != null).length;
      vi.advanceTimersByTime(35000);
      handler({ heading: 90 }); handler({ heading: 110 });
      expect(service.getLastPosition()!.coordinate).toEqual(before);
      expect(dot.update.mock.calls.filter(([value]: any[]) => value.latitude != null)).toHaveLength(coordinateCalls);
      expect(dot.update).toHaveBeenCalledWith({ heading: expect.any(Number) }, { silent: true, animate: false });
      expect(positionCalls).not.toHaveBeenCalled();
      expect(diagnostic).toHaveBeenCalledWith('heading.filtered', expect.objectContaining({ heading: expect.any(Number) }));
      expect(diagnostic).toHaveBeenCalledWith('heading.freshness', expect.objectContaining({ headingFresh: false, reason: 'no-heading-within-4000ms-hold-last-direction' }));
      expect(dot.updateState).not.toHaveBeenCalledWith({ heading: { visible: false, opacity: 0 } });
      handler({ heading: 120 }); vi.advanceTimersByTime(500);
      expect(diagnostic).toHaveBeenCalledWith('heading.freshness', expect.objectContaining({ headingFresh: true }));
    } finally { service.setHeadingDiagnostics(null); service.stopTracking(); vi.useRealTimers(); }
  });

  it('prevents an old async disable from hiding a newly acquired demo glow', async () => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0] as any;
    service.prepare();
    let finish!: () => void;
    dot.watchDeviceOrientation.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const pendingDisable = service.disableHeading();
    const diagnostic = vi.fn(); service.setHeadingDiagnostics(diagnostic);
    try {
      service.setSimulatorParallelMode(true, { compassGlow: true });
      await service.enableHeading({ forceDuringSimulator: true });
      finish(); await pendingDisable;
      expect(dot.updateState).not.toHaveBeenCalledWith({ heading: { visible: false, opacity: 0 } });
      expect(diagnostic).toHaveBeenCalledWith('heading.stale-completion', expect.objectContaining({ reason: 'disable-superseded-by-new-owner' }));
      expect(dot.watchDeviceOrientation).toHaveBeenLastCalledWith(true);
    } finally { service.setHeadingDiagnostics(null); service.stopTracking(); }
  });

  it('observes the existing SDK sensor and restores normal timeout/listener ownership on release', async () => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0] as any;
    const sensor = { on: vi.fn(), off: vi.fn(), enable: vi.fn(), disable: vi.fn(),
      checkPermission: vi.fn().mockResolvedValue('granted') };
    dot.Sensors.get.mockImplementation(() => sensor);
    const diagnostic = vi.fn(); service.setHeadingDiagnostics(diagnostic);
    try {
      service.setSimulatorParallelMode(true, { compassGlow: true });
      await service.enableHeading({ forceDuringSimulator: true });
      expect(sensor.enable).not.toHaveBeenCalled(); // watchDeviceOrientation already owns enable.
      sensor.on.mock.calls[0][1]({ update: { heading: 42 } });
      expect(diagnostic).toHaveBeenCalledWith('heading.raw', expect.objectContaining({ heading: 42 }));
      expect(diagnostic).toHaveBeenCalledWith('orientation.permission', expect.objectContaining({ permission: 'granted' }));
      service.setSimulatorParallelMode(false);
      service.setHeadingDiagnostics(null);
      expect(sensor.off).toHaveBeenCalledWith('absolute-update', expect.any(Function));
      dot.enable.mockClear();
      service.setSimulatorParallelMode(true, { compassGlow: true });
      await service.enableHeading({ forceDuringSimulator: true });
      expect(dot.enable).toHaveBeenCalledWith(expect.objectContaining({ timeout: 30000 }));
      expect(diagnostic).toHaveBeenCalledWith('glow.removed', expect.objectContaining({ reason: 'provider-release-sdk-disable' }));
    } finally { service.setHeadingDiagnostics(null); service.stopTracking(); }
  });

  it('records actual SDK model visibility and browser diagnostics without a second compass consumer', async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, (event: unknown) => void>();
    vi.stubGlobal('window', { addEventListener: vi.fn((name, cb) => listeners.set(name, cb)), removeEventListener: vi.fn() });
    const getState = vi.fn().mockReturnValue({ visible: true });
    const service = new MapMarkerService({ getState } as never); const dot = blueDotMock.instances[0] as any;
    const model = {}; dot.headingConeModel = model;
    const diagnostic = vi.fn(); service.setHeadingDiagnostics(diagnostic);
    try {
      service.setSimulatorParallelMode(true, { compassGlow: true });
      await service.enableHeading({ forceDuringSimulator: true });
      listeners.get('deviceorientation')?.({ type: 'deviceorientation', alpha: 10, absolute: false, webkitCompassHeading: 350 });
      vi.advanceTimersByTime(500);
      expect(diagnostic).toHaveBeenCalledWith('orientation.browser-event', expect.objectContaining({ heading: 350, alpha: 10 }));
      expect(diagnostic).toHaveBeenCalledWith('glow.created', expect.any(Object));
      expect(diagnostic).toHaveBeenCalledWith('glow.visibility', expect.objectContaining({ visible: true, source: 'sdk-model-state' }));
      getState.mockReturnValue({ visible: false }); vi.advanceTimersByTime(500);
      expect(diagnostic).toHaveBeenCalledWith('glow.visibility', expect.objectContaining({ visible: false, source: 'sdk-model-state' }));
      service.setHeadingDiagnostics(null);
      expect(window.removeEventListener).toHaveBeenCalledTimes(2);
    } finally { service.setHeadingDiagnostics(null); service.stopTracking(); vi.unstubAllGlobals(); vi.useRealTimers(); }
  });

  it('interpolates demo positions without replacing authority, heading or navigation evidence', async () => {
    let now = 0; let id = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++id, cb); return id; });
    vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key));
    const frameAt = (at: number) => { now = at; const batch = [...frames.values()]; frames.clear(); for (const cb of batch) cb(at); };
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0] as any;
    const callback = vi.fn(); service.attachHandlers({ onPosition: callback, onAnimatedPosition: callback });
    const base = { latitude: 43, longitude: -80, accuracy: 4, floorId: 'g', source: 'physical-gps-transformed' as const, timestamp: 1000 };
    try {
      service.setSimulatorParallelMode(true, { compassGlow: true });
      await service.enableHeading({ forceDuringSimulator: true });
      service.applyProviderFrame(base);
      now = 1000; service.applyProviderFrame({ ...base, latitude: 43.00005, timestamp: 2000 });
      expect(service.getLastPosition()!.coordinate.latitude).toBe(43.00005);
      frameAt(1400);
      expect(dot.coordinate.latitude).toBeCloseTo(43.000025, 9);
      const orientation = dot.on.mock.calls.find(([event]: [string]) => event === 'device-orientation-update')[1];
      // Leave heading RAF out of this test; use synchronous visual-heading fallback.
      const raf = globalThis.requestAnimationFrame; vi.stubGlobal('requestAnimationFrame', undefined);
      orientation({ heading: 90 }); orientation({ heading: 90 });
      vi.stubGlobal('requestAnimationFrame', raf);
      const heading = service.getLastPosition()!.heading;
      service.applyProviderFrame({ ...base, latitude: 43.00005, longitude: -79.99995, timestamp: 3000 });
      expect(dot.coordinate.latitude).toBeCloseTo(43.000025, 9);
      frameAt(1800);
      expect(dot.coordinate.latitude).toBeCloseTo(43.00005, 9);
      expect(dot.coordinate.longitude).toBeCloseTo(-79.99995, 9);
      const animated = dot.on.mock.calls.find(([event]: [string]) => event === 'dot-position-update')[1];
      animated({ position: { latitude: 0, longitude: 0 } });
      expect(service.getLastPosition()!.coordinate.latitude).toBe(43.00005);
      expect(service.getLastPosition()!.heading).toBe(heading);
      expect(callback).not.toHaveBeenCalled();
      const calls = dot.update.mock.calls.length;
      frameAt(30000); expect(dot.update).toHaveBeenCalledTimes(calls);
      now = 31000; service.applyProviderFrame({ ...base, timestamp: 4000 });
      service.setSimulatorParallelMode(false); frameAt(32000);
      expect(frames.size).toBe(0);
    } finally {
      service.setSimulatorParallelMode(false); service.stopTracking();
      vi.restoreAllMocks(); vi.unstubAllGlobals();
    }
  });

  it('allows unsnapped demo rendering outside camera pan bounds and restores production renderer limits', () => {
    const service = new MapMarkerService({} as never); const dot = blueDotMock.instances[0] as any;
    dot.getState = vi.fn().mockReturnValue({ timeout: 30000, preventOutOfBounds: true });
    const diagnostic = vi.fn();
    service.prepare(); service.setHeadingDiagnostics(diagnostic);
    try {
      service.setSimulatorParallelMode(true, { compassGlow: true });
      expect(dot.updateState).toHaveBeenCalledWith(expect.objectContaining({ preventOutOfBounds: false }));
      service.setSimulatorParallelMode(false); service.setHeadingDiagnostics(null);
      expect(dot.updateState).toHaveBeenLastCalledWith({ timeout: 30000, preventOutOfBounds: true });
    } finally { service.setHeadingDiagnostics(null); service.stopTracking(); }
  });

  it('position diagnostics read SDK state without writing sensors, marker or camera', () => {
    const getState = vi.fn(() => ({ position: { latitude: 43, longitude: -80, floorId: 'g' } }));
    const service = new MapMarkerService({ getState } as never);
    const dot = blueDotMock.instances[0] as any;
    dot.coordinate = { latitude: 43, longitude: -80 }; dot.dotModel = { id: 'dot' };
    const diagnostic = vi.fn();
    service.setPositionDiagnostics(diagnostic);
    expect(diagnostic).toHaveBeenCalledWith('position.audit.attached', expect.objectContaining({
      sdkLatitude: 43, modelLatitude: 43, modelObservable: true, pixelPositionObservable: false }));
    expect(dot.update).not.toHaveBeenCalled(); expect(dot.enable).not.toHaveBeenCalled();
    expect(dot.updateState).not.toHaveBeenCalled(); expect(dot.follow).not.toHaveBeenCalled();
    getState.mockClear(); service.setPositionDiagnostics(null);
    (service as any).positionEvent('test', {}, true); expect(getState).not.toHaveBeenCalled();
  });

  it('records a foreign writer while a physical animation is still active', () => {
    const service = new MapMarkerService({} as never); const diagnostic = vi.fn();
    vi.stubGlobal('requestAnimationFrame', undefined);
    try {
      service.setPositionDiagnostics(diagnostic); service.setSimulatorParallelMode(true, { compassGlow: true });
      service.applyProviderFrame({ latitude: 43, longitude: -80, floorId: 'g', accuracy: 4, timestamp: 1000, source: 'physical-gps-transformed' });
      service.applySimulatorFrame({ latitude: 43.0001, longitude: -80, floorId: 'g', accuracy: 4, timestamp: 2000, source: 'gps' });
      expect(diagnostic).toHaveBeenCalledWith('position.audit.writer', expect.objectContaining({ source: 'gps', foreignWriter: true }));
      expect(diagnostic).toHaveBeenCalledWith('position.audit.animation-complete', expect.objectContaining({ interpolatedLatitude: 43, sdkLatitude: 43, reason: 'after-sdk-update-call' }));
    } finally { service.setPositionDiagnostics(null); service.setSimulatorParallelMode(false); vi.unstubAllGlobals(); }
  });

});
