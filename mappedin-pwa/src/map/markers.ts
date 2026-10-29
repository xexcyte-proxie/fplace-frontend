import { requestDeviceOrientationPermission } from '../position/providers/gpsProvider';
import { haversineMeters } from '../utils/geo-math';
import { recordLocationDiagnostic } from '../location/domain/location-diagnostics';
import { navigationDiagnostics as navDiag } from '../position/debug/navigation-diagnostics';
import { BlueDot } from "@mappedin/blue-dot";
import type { Coordinate, MapView } from "@mappedin/mappedin-js";

import type { FplacesPositionFrame } from "../position/types";
import {
  createCompassHeadingFilter,
  COMPASS_FRESH_MS,
  headingFromOrientationEvent,
  isAbsoluteOrientationEvent,
  readScreenOrientationDeg,
  HEADING_PUBLISH_MIN_DELTA_DEG,
  HEADING_PUBLISH_MIN_INTERVAL_MS,
  normalizeHeadingDegrees,
  resolveNavigationConeHeading,
  shortestHeadingDelta,
  stepVisualHeading,
} from "../position/domain/cone-heading";
import { createStationaryPositionFilter } from "../position/domain/stationary-position-filter";
import type { RouteCoordinate } from "../types";
import { appLog, appWarn } from "../utils/logger";

export type BlueDotTrackingStatus =
  | "off"
  | "starting"
  | "active"
  | "inactive"
  | "error";

export interface BlueDotPosition {
  coordinate: RouteCoordinate;
  mapCoordinate?: Coordinate;
  accuracy?: number;
  heading?: number;
  floorId?: string;
  timestamp?: number;
}

const MARKER_OVERLAY_ID = "fplaces-nav-marker-overlay";

/** Path/GPS bearing drives the cone during simulated walk; live compass still wins once locked. */
const TEMP_COMPASS_GLOW_OVER_SIM_HEADING = false;

const HEADING_CONE = {
  visible: true,
  opacity: 0.85,
  color: "#2266ff",
  displayWhenInactive: true,
} as const;

/** Blue Dot appearance while navigation frames are injected (sim walk or live IPS). */
const NAV_BLUE_DOT_STATE = {
  visible: true,
  color: "#2266ff",
  heading: { ...HEADING_CONE },
  accuracyRing: { visible: false },
  inactiveColor: "#64748b",
  timeout: 30_000,
};

/** Only used when a caller has no reported uncertainty. Never cap actual GPS accuracy. */
const DEFAULT_INJECTED_ACCURACY_METERS = 30;

export class MapMarkerService {
  private readonly blueDot: BlueDot;
  private tracking = false;
  private navigationAppearance = false;
  private simulatorDrivesAvatar = false;
  private compassGlow = false;
  private deviceHeadingActive = false;
  private positionAvailability: 'unavailable' | 'live' | 'approximate' | 'retained' = 'unavailable';
  private lastPositionReceivedAt: number | null = null;
  private lastPositionFixTimestamp: number | null = null;
  private pendingNativeFixTimestamp: number | null = null;
  private lastHeadingError: string | null = null;
  private lastHeadingEventAt: number | null = null;
  private lastRawHeadingEventAt: number | null = null;
  private rawHeadingHandler: ((event: DeviceOrientationEvent) => void) | null = null;
  private compassPermission = 'unknown';
  private headingSource = 'unavailable';
  private headingGeneration = 0;
  private headingStart: Promise<void> | null = null;
  private lastDeviceHeading: number | null = null;
  private visualHeading: number | null = null;
  private headingTarget: number | null = null;
  private headingRaf = 0;
  private lastPublishedHeading: number | null = null;
  private lastSdkSubmittedHeading: number | null = null;
  private lastHeadingPublishAt = 0;
  private followIncludesHeading = false;
  private readonly compassFilter = createCompassHeadingFilter();
  private readonly stationaryFilter = createStationaryPositionFilter({ confirmationSamples: 2 });
  private lastPosition: BlueDotPosition | null = null;
  private overlayShell: HTMLElement | null = null;
  private overlayArrow: HTMLElement | null = null;
  private trackingGeneration = 0;
  private trackingStart: Promise<void> | null = null;
  private destroyed = false;
  private onPosition?: (position: BlueDotPosition) => void;
  private onAnimatedPosition?: (position: BlueDotPosition) => void;
  private onStatus?: (status: BlueDotTrackingStatus) => void;

  constructor(private readonly mapView: MapView) {
    this.blueDot = new BlueDot(mapView);
    this.blueDot.disable();
    this.wireEvents();
    this.mountCustomOverlay();
  }

  attachHandlers(handlers: {
    onPosition?: (position: BlueDotPosition) => void;
    onAnimatedPosition?: (position: BlueDotPosition) => void;
    onStatus?: (status: BlueDotTrackingStatus) => void;
  }): void {
    this.onPosition = handlers.onPosition;
    this.onAnimatedPosition = handlers.onAnimatedPosition;
    this.onStatus = handlers.onStatus;
  }

  prepare(options?: { simulatorBoot?: boolean }): void {
    navDiag?.record('renderer-lifecycle', 'MapMarkerService.prepare', { reason: 'map-boot', simulatorBoot: !!options?.simulatorBoot });
    this.navigationAppearance = false;
    if (options?.simulatorBoot) {
      this.blueDot.disable();
      if (this.overlayShell) this.overlayShell.style.display = "none";
      appLog(
        "MapMarker",
        "Prepared (native Blue Dot suppressed for simulator)",
      );
      return;
    }

    this.blueDot.enable({
      watchDevicePosition: false,
      // Ambient boot stays invisible so GPS does not look like a start pin
      // and the accuracy ring does not paint a huge circle on the venue map.
      visible: false,
      color: "transparent",
      heading: { visible: false },
      accuracyRing: { visible: false },
      inactiveColor: "#64748b",
      timeout: 30_000,
    });
    appLog("MapMarker", "Prepared");
  }

  private get visibleBlueDotState() {
    return { ...NAV_BLUE_DOT_STATE, color: this.positionAvailability === 'retained' || this.positionAvailability === 'approximate'
      ? NAV_BLUE_DOT_STATE.inactiveColor : NAV_BLUE_DOT_STATE.color };
  }

  private enableSimulatorBlueDot(): void {
    this.navigationAppearance = true;
    if (this.blueDot.isEnabled) {
      // prepare() may have booted an ambient dot (transparent core, hidden
      // cone). Without restoring the navigation appearance here, the avatar
      // and directional glow stay invisible for live (non-simulated) routes.
      this.blueDot.updateState({ ...this.visibleBlueDotState });
      return;
    }

    this.blueDot.enable({
      watchDevicePosition: false,
      initialState: "hidden",
      ...this.visibleBlueDotState,
    });
  }

  setSimulatorParallelMode(
    active: boolean,
    options?: { compassGlow?: boolean },
  ): void {
    if (this.simulatorDrivesAvatar === active) {
      if (active && options?.compassGlow) this.compassGlow = true;
      if (active && this.compassGlow && !this.deviceHeadingActive) {
        void this.enableHeading({ forceDuringSimulator: true });
      }
      return;
    }
    this.headingGeneration += 1;
    this.headingStart = null;
    this.trackingGeneration += 1;
    this.trackingStart = null;
    this.tracking = false;
    this.simulatorDrivesAvatar = active;
    navDiag?.update('renderer-owner', 'MapMarkerService.setSimulatorParallelMode', { reason: 'position-authority-handoff', owner: active ? 'application-provider' : 'native-sdk', nativeGps: !active });
    this.compassGlow = active && options?.compassGlow === true;
    if (active) {
      this.enableSimulatorBlueDot();
      this.blueDot.watchDevicePosition(false);
      this.blueDot.Sensors.get("geolocation")?.disable();
      this.blueDot.setPositionProcessor(undefined);
      this.stationaryFilter.reset();
      if (this.overlayShell) this.overlayShell.style.display = "none";

      if (this.compassGlow || TEMP_COMPASS_GLOW_OVER_SIM_HEADING) {
        void this.enableHeading({ forceDuringSimulator: true });
      } else {
        this.detachRawHeadingListener();
        this.deviceHeadingActive = false;
        this.lastDeviceHeading = null;
        this.stopHeadingAnimation();
        this.compassFilter.reset();
        this.blueDot.Sensors.get("deviceorientation")?.disable();
        this.blueDot.watchDeviceOrientation(false).catch(() => undefined);
      }
      return;
    }

    this.compassGlow = false;
    // Transfer positioning ownership without disabling the renderer or compass.
    // Native tracking can resume while the last accepted map position remains visible.
    this.setPositionAvailability('retained');
    this.blueDot.setPositionProcessor(undefined);
    this.stationaryFilter.reset();
    this.stopFollow();
    if (this.overlayShell) this.overlayShell.style.display = "none";
  }

  applyProviderFrame(frame: FplacesPositionFrame): void {
    if (this.destroyed) return;
    // Only reveal in response to a real accepted coordinate, never an enable()
    // call with a fabricated origin. Restore appearance after disable/idle boot.
    if (!Number.isFinite(frame.latitude) || Math.abs(frame.latitude) > 90 ||
        !Number.isFinite(frame.longitude) || Math.abs(frame.longitude) > 180) {
      recordLocationDiagnostic('blue-dot-unavailable', { reason: 'invalid-provider-coordinate' });
      return;
    }
    this.enableVisibleBlueDot();
    const compassDriving = this.isCompassDrivingCone();
    // In live GPS mode the glow is facing direction, not GPS travel course.
    // Explicit path simulation (compassGlow off) retains its existing bearing behavior.
    const headingCandidate = frame.source === 'gps' && this.compassGlow ? undefined : frame.heading;
    const resolved = compassDriving
      ? (this.visualHeading ?? this.lastDeviceHeading ?? undefined)
      : this.resolveConeHeading(headingCandidate);
    const heading =
      resolved ??
      (this.lastDeviceHeading != null ? this.lastDeviceHeading : undefined);
    const headingForDot = heading ?? this.lastPublishedHeading ?? undefined;
    const isFirstFix = this.lastPosition == null;
    const samePlace =
      this.lastPosition != null &&
      this.lastPosition.coordinate.latitude === frame.latitude &&
      this.lastPosition.coordinate.longitude === frame.longitude;

    if (this.simulatorDrivesAvatar) {
      this.blueDot.update(
        {
          latitude: frame.latitude,
          longitude: frame.longitude,
          ...(headingForDot != null ? { heading: headingForDot } : {}),
          accuracy: frame.accuracy,
          floorOrFloorId: frame.floorId,
        },
        // Animate only a real position change. Re-animating heading on every
        // GPS tick is what makes the glow flicker.
        { animate: !isFirstFix && !samePlace },
      );
    } else {
      this.blueDot.reportPosition({
        latitude: frame.latitude,
        longitude: frame.longitude,
        ...(headingForDot != null ? { heading: headingForDot } : {}),
        accuracy: frame.accuracy,
        confidence: 0.75,
      });
    }

    if (headingForDot != null) this.lastSdkSubmittedHeading = headingForDot;
    if (typeof heading === "number") this.applyHeading(heading);
    if (typeof heading === "number" && !compassDriving) {
      this.headingSource = headingCandidate != null ? 'provider-course-or-heading' : this.lastDeviceHeading != null ? this.headingSource : 'retained-heading';
      this.setConeHeadingTarget(heading);
    }

    navDiag?.update('mappedin-conversion', 'BlueDot.applyProviderFrame', { input: frame,
      mapCoordinate: this.blueDot.coordinate ? { latitude: this.blueDot.coordinate.latitude, longitude: this.blueDot.coordinate.longitude,
        floorId: this.blueDot.coordinate.floorId, verticalOffset: this.blueDot.coordinate.verticalOffset } : null });
    const position = this.toPosition(
      {
        latitude: frame.latitude,
        longitude: frame.longitude,
        floorId: frame.floorId,
      } as Coordinate,
      frame.accuracy,
      heading,
      frame.floorId,
    );
    position.timestamp = frame.timestamp;
    this.lastPosition = position;
    this.lastPositionReceivedAt = Date.now();
    this.lastPositionFixTimestamp = frame.timestamp ?? null;
    this.setPositionAvailability('live');
    this.recordRendererSubmission(frame, 'accepted-provider-position');
    // Keep follow mode in sync (e.g. sim heading upgrade) without re-animating
    // the camera — duration is 0 while already following.
    if (this.blueDot.isFollowing) this.syncFollowMode();
    // Simulator frames stream to AR via handleProviderFrame; skip animated callback
    // so shared AR throttle is not consumed before the iframe dispatch runs.
    if (!this.simulatorDrivesAvatar) {
      this.onAnimatedPosition?.(position);
    }
  }

  applySimulatorFrame(frame: FplacesPositionFrame): void {
    this.applyProviderFrame(frame);
  }

  applyHeading(heading: number | null | undefined): void {
    if (heading == null || !Number.isFinite(heading)) return;
    const deg = ((heading % 360) + 360) % 360;
    if (this.overlayArrow) {
      this.overlayArrow.style.transform = `rotate(${deg}deg)`;
    }
  }

  /** Compass-only tick: rotate the cone without re-reporting lat/lng. */
  applyHeadingOnly(heading: number | null | undefined): void {
    if (heading == null || !Number.isFinite(heading)) return;
    // Compass is already driving the glow; a second GPS/provider heading
    // pipeline is what made the cone flicker between two filters.
    if (this.isCompassDrivingCone()) return;
    this.headingSource = 'provider-orientation';
    this.setConeHeadingTarget(heading);
    if (this.lastPosition) this.lastPosition = { ...this.lastPosition, heading };
  }

  get isTracking(): boolean {
    return this.tracking;
  }

  get isFollowing(): boolean {
    return this.blueDot.isFollowing;
  }

  get coordinate(): Coordinate | undefined {
    return this.blueDot.coordinate;
  }

  getLastPosition(): BlueDotPosition | null {
    return this.lastPosition;
  }

  private recordRendererSubmission(input: { latitude: number; longitude: number }, reason: string): void {
    if (!navDiag) return;
    navDiag.update('blue-dot-submission', 'MapMarkerService', { input, reason,
      renderer: this.getLocationDiagnosticSnapshot(input), visualVisibility: 'not-verified-by-sdk-state' });
  }

  /** Signal loss changes presentation, never the accepted coordinate or its age. */
  setPositionAvailability(availability: 'live' | 'approximate' | 'retained'): void {
    const next = this.lastPosition ? availability : 'unavailable';
    if (next === this.positionAvailability) return;
    const previous = this.positionAvailability;
    this.positionAvailability = next;
    navDiag?.update('position-retention', 'MapMarkerService.setPositionAvailability', { reason: next === 'retained' ? 'signal-interruption-retain-without-new-fix' : 'position-quality-presentation',
      previousState: previous, newState: next, fixTimestamp: this.lastPositionFixTimestamp, coordinate: this.lastPosition?.coordinate });
    if (this.blueDot.isEnabled && this.lastPosition) {
      this.blueDot.updateState({ color: next === 'live' ? NAV_BLUE_DOT_STATE.color : NAV_BLUE_DOT_STATE.inactiveColor });
    }
  }

  /** Read-only SDK observation; configured visibility does not certify on-screen pixels. */
  getLocationDiagnosticSnapshot(expected?: { latitude: number; longitude: number }) {
    if (!import.meta.env.DEV) return null;
    const point = (coordinate: { latitude: number; longitude: number; floorId?: string } | null | undefined) => coordinate
      ? { latitude: coordinate.latitude, longitude: coordinate.longitude, floorId: coordinate.floorId ?? null } : null;
    const sdkCoordinate = point(this.blueDot.coordinate);
    const state = this.blueDot.getState?.();
    const currentFloorId = this.mapView.currentFloor?.id ?? null;
    const markerFloorId = this.blueDot.floor?.id ?? this.lastPosition?.floorId ?? this.lastPosition?.coordinate.floorId ?? null;
    const deltaMeters = expected && sdkCoordinate ? haversineMeters(expected, sdkCoordinate) : null;
    return {
      sdkCoordinate, applicationCoordinate: point(this.lastPosition?.coordinate),
      positionAvailability: this.positionAvailability, lastPositionReceivedAt: this.lastPositionReceivedAt,
      lastPositionAgeMs: this.lastPositionReceivedAt == null ? null : Date.now() - this.lastPositionReceivedAt,
      lastPositionFixTimestamp: this.lastPositionFixTimestamp,
      lastPositionFixAgeMs: this.lastPositionFixTimestamp == null ? null : Date.now() - this.lastPositionFixTimestamp,
      reportedAccuracyMeters: this.lastPosition?.accuracy ?? null,
      sdkAccuracyMeters: this.blueDot.accuracy ?? null, sdkStatus: this.blueDot.status ?? null,
      enabled: this.blueDot.isEnabled, configuredVisible: state?.visible ?? null, color: state?.color ?? null,
      navigationAppearance: this.navigationAppearance, tracking: this.tracking, following: this.blueDot.isFollowing,
      providerDriven: this.simulatorDrivesAvatar, markerFloorId, currentFloorId,
      compass: { enabled: this.deviceHeadingActive, pending: !!this.headingStart,
        preferredDuringSimulation: this.compassGlow, locked: this.compassFilter.isLocked(),
        deviceHeading: this.lastDeviceHeading, displayedHeading: this.visualHeading,
        lastEventAt: this.lastHeadingEventAt, startupError: this.lastHeadingError, permission: this.compassPermission,
        source: this.headingSource, ageMs: this.lastHeadingEventAt == null ? null : Date.now() - this.lastHeadingEventAt,
        fresh: this.lastHeadingEventAt != null && Date.now() - this.lastHeadingEventAt <= COMPASS_FRESH_MS,
        rawListenerActive: !!this.rawHeadingHandler, sdkSubmittedHeading: this.lastSdkSubmittedHeading,
        expectedVisualHeading: this.visualHeading == null ? null : normalizeHeadingDegrees(this.visualHeading - (this.mapView.Camera?.bearing ?? 0)),
        cone: state?.heading ?? null },
      floorMatchesView: markerFloorId && currentFloorId ? markerFloorId === currentFloorId : null,
      visibilityEvidence: 'SDK state only; viewport/occlusion/pixels are not verified',
      expectedCoordinate: point(expected), differenceFromExpectedMeters: deltaMeters,
      matchesExpectedWithin1cm: deltaMeters == null ? null : deltaMeters <= 0.01,
    };
  }

  /**
   * Make the user marker visible and place it at a GPS fix, then pan the camera.
   * Used by the My location control so a tap always shows "you are here".
   */
  showLivePosition(
    input: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      timestamp?: number;
      heading?: number | null;
      floorId?: string;
    },
    options?: { follow?: boolean },
  ): void {
    this.enableVisibleBlueDot();

    const accuracy = input.accuracy ?? DEFAULT_INJECTED_ACCURACY_METERS;
    const heading =
      input.heading != null && Number.isFinite(input.heading)
        ? ((input.heading % 360) + 360) % 360
        : this.resolveConeHeading();
    const floor = this.mapView.currentFloor;
    const floorId = input.floorId ?? floor?.id;

    this.blueDot.update(
      {
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy,
        ...(heading != null ? { heading } : {}),
        ...(floorId ? { floorOrFloorId: floorId } : {}),
      },
      { animate: false },
    );

    if (heading != null) this.lastSdkSubmittedHeading = heading;
    const mapCoordinate =
      this.mapView.createCoordinate?.(
        input.latitude,
        input.longitude,
        floor ?? undefined,
      ) ?? this.blueDot.coordinate;

    this.lastPosition = {
      coordinate: {
        latitude: input.latitude,
        longitude: input.longitude,
        floorId: floorId ?? "unknown",
      },
      mapCoordinate: mapCoordinate as Coordinate | undefined,
      accuracy: input.accuracy ?? undefined,
      heading,
      floorId,
      timestamp: input.timestamp,
    };
    this.lastPositionReceivedAt = Date.now();
    this.lastPositionFixTimestamp = input.timestamp ?? null;
    this.setPositionAvailability('live');
    this.recordRendererSubmission(input, 'location-button-position');
    this.stationaryFilter.reset();
    this.stationaryFilter.process({
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy ?? undefined,
      timestamp: input.timestamp,
    });

    if (options?.follow !== false) {
      this.follow();
    }
    this.focusOnUser();
  }

  async startTracking(options?: {
    follow?: boolean;
    watchDevicePosition?: boolean;
  }): Promise<void> {
    if (this.destroyed) return;
    if (this.trackingStart) return this.trackingStart;
    if (this.tracking) { if (options?.follow) this.follow(); return; }
    const generation = this.trackingGeneration;
    const current = () => !this.destroyed && generation === this.trackingGeneration;
    const watchGps = options?.watchDevicePosition ?? !this.simulatorDrivesAvatar;
    const start = async () => {
      navDiag?.record('subscription', 'BlueDot.startTracking', { watchDevicePosition: watchGps });
      this.onStatus?.('starting');
      this.enableVisibleBlueDot();
      if (watchGps) {
        this.installStationaryPositionProcessor();
        const geolocation = this.blueDot.Sensors.get('geolocation');
        await geolocation?.enable();
        if (!current()) return;
        this.blueDot.watchDevicePosition(true);
        await this.enableHeading().catch(() => undefined);
        if (!current()) return;
      }
      this.tracking = true;
      if (options?.follow) this.follow();
      recordLocationDiagnostic('blue-dot-tracking-started', { source: watchGps ? 'device' : 'provider' });
      appLog('MapMarker', 'Tracking started', { follow: options?.follow ?? false });
    };
    const pending = start();
    this.trackingStart = pending;
    try { await pending; }
    finally { if (this.trackingStart === pending) this.trackingStart = null; }
  }

  async enableHeading(options?: {
    forceDuringSimulator?: boolean;
  }): Promise<void> {
    if (this.destroyed) return;
    if (this.simulatorDrivesAvatar && !options?.forceDuringSimulator &&
        !this.compassGlow && !TEMP_COMPASS_GLOW_OVER_SIM_HEADING) return;
    if (this.blueDot.isEnabled) this.blueDot.updateState({ heading: { ...HEADING_CONE } });
    if (this.deviceHeadingActive) return;
    if (this.headingStart) return this.headingStart;
    const generation = ++this.headingGeneration;
    const trackingGeneration = this.trackingGeneration;
    // Start immediately so an explicit location tap retains iOS user activation.
    const pending = this.startDeviceHeading(generation, trackingGeneration);
    this.headingStart = pending;
    try { await pending; }
    finally { if (this.headingStart === pending) this.headingStart = null; }
  }

  private async startDeviceHeading(generation: number, trackingGeneration: number): Promise<void> {
    const current = () => !this.destroyed && generation === this.headingGeneration && trackingGeneration === this.trackingGeneration;
    this.lastHeadingError = null;
    try {
      // This helper invokes the native permission API before its first await.
      // SDK enable() otherwise awaits checkPermission before requesting on iOS.
      const granted = await requestDeviceOrientationPermission('MapMarkerService');
      if (!current()) return;
      this.compassPermission = granted ? 'granted-or-not-required' : 'denied-or-unavailable';
      if (!granted) throw new Error('Orientation permission unavailable or denied; tap Enable Compass to retry.');
      const orientation = this.blueDot.Sensors.get("deviceorientation");
      if (!orientation) throw new Error('SDK orientation sensor unavailable');
      this.attachRawHeadingListener();
      const permission = await orientation.enable();
      if (!current()) return;
      // SDK BaseSensor.enable resolves denied/unavailable instead of rejecting.
      if (permission === 'denied' || permission === 'unavailable' || permission === 'prompt') {
        this.compassPermission = permission;
        throw new Error(`SDK orientation sensor: ${permission}`);
      }
      await this.blueDot.watchDeviceOrientation(true);
      if (!current()) return;
      this.deviceHeadingActive = true;
      const heading = this.resolveConeHeading();
      if (heading != null) this.pushConeHeading(heading);
    } catch (error) {
      if (!current()) return;
      this.deviceHeadingActive = false;
      this.lastHeadingError = error instanceof Error ? error.message : String(error);
      this.detachRawHeadingListener();
      navDiag?.record('error', 'MapMarkerService.enableHeading', { reason: 'compass-startup-failed', error: this.lastHeadingError, permission: this.compassPermission });
      appWarn(
        "MapMarker",
        "Compass unavailable - cone follows provider heading",
        error,
      );
      return;
    }

    if (this.overlayArrow) {
      this.overlayArrow.style.display = "";
    }
    appLog("MapMarker", "Device heading enabled", {
      compassOverSim: TEMP_COMPASS_GLOW_OVER_SIM_HEADING,
    });
  }

  private attachRawHeadingListener(): void {
    if (this.rawHeadingHandler || typeof window === 'undefined' || !window.addEventListener) return;
    this.rawHeadingHandler = event => {
      if (this.destroyed || (this.simulatorDrivesAvatar && !this.compassGlow)) return;
      this.lastRawHeadingEventAt = Date.now();
      const screen = readScreenOrientationDeg(window.screen?.orientation?.angle, typeof window.orientation === 'number' ? window.orientation : null);
      const absolute = isAbsoluteOrientationEvent(event);
      const eventAgeMs = typeof event.timeStamp === 'number' && event.timeStamp > 0
        ? (event.timeStamp > 1e12 ? Date.now() : performance.now()) - event.timeStamp : null;
      const stale = eventAgeMs != null && (eventAgeMs > COMPASS_FRESH_MS || eventAgeMs < -1000);
      const normalized = headingFromOrientationEvent(event, { screenOrientationDeg: screen });
      const heading = absolute && !stale ? this.compassFilter.ingest(event, performance.now(), screen) : null;
      const reason = stale ? 'stale-or-future-orientation-event' : !absolute ? 'relative-orientation-has-no-north-reference' : normalized == null ? 'invalid-or-unreliable-compass' : heading == null ? 'filter-settling' : 'accepted-compass-heading';
      navDiag?.sample('compass-raw', 'MapMarkerService.orientation', { alpha: event.alpha, beta: event.beta, gamma: event.gamma,
        absolute: event.absolute, type: event.type, webkitCompassHeading: event.webkitCompassHeading,
        webkitCompassAccuracy: event.webkitCompassAccuracy, screenOrientationDeg: screen, normalized,
        receivedAt: this.lastRawHeadingEventAt, eventTimestamp: event.timeStamp, eventAgeMs, reason,
        northReference: absolute ? 'browser-earth-reference; magnetic-versus-true-north-unreported' : 'relative-unknown-north' });
      navDiag?.sample('compass-filter', 'MapMarkerService.orientation', { normalized, smoothed: heading, locked: this.compassFilter.isLocked(), reason });
      if (heading == null) return;
      this.acceptCompassHeading(heading, 'raw-absolute-compass');
    };
    window.addEventListener('deviceorientationabsolute', this.rawHeadingHandler, true);
    window.addEventListener('deviceorientation', this.rawHeadingHandler, true);
    navDiag?.update('compass-listener', 'MapMarkerService', { listening: true, reason: 'heading-watch-enabled', independentOfGps: true });
  }

  private detachRawHeadingListener(): void {
    if (!this.rawHeadingHandler) return;
    if (typeof window !== 'undefined') {
      window.removeEventListener('deviceorientationabsolute', this.rawHeadingHandler, true);
      window.removeEventListener('deviceorientation', this.rawHeadingHandler, true);
    }
    this.rawHeadingHandler = null;
    this.lastRawHeadingEventAt = null;
    navDiag?.update('compass-listener', 'MapMarkerService', { listening: false, reason: 'heading-watch-stopped' });
  }

  private acceptCompassHeading(heading: number, source: string): void {
    this.lastHeadingEventAt = Date.now(); this.headingSource = source;
    this.lastDeviceHeading = heading; this.pushConeHeading(heading);
    if (this.lastPosition) this.lastPosition = { ...this.lastPosition, heading };
  }

  async disableHeading(): Promise<void> {
    this.detachRawHeadingListener();
    const generation = ++this.headingGeneration;
    this.headingStart = null;
    this.deviceHeadingActive = false;
    this.lastDeviceHeading = null;
    this.stopHeadingAnimation();
    this.compassFilter.reset();
    this.blueDot.Sensors.get("deviceorientation")?.disable();
    await this.blueDot.watchDeviceOrientation(false).catch(() => undefined);
    if (this.destroyed || generation !== this.headingGeneration) return;
    if (this.blueDot.isEnabled) {
      this.blueDot.updateState({
        heading: { visible: false, opacity: 0 },
      });
    }
    if (this.overlayArrow) {
      this.overlayArrow.style.display = "none";
    }
    appLog("MapMarker", "Device heading disabled");
  }

  resetNavigationDisplay(): void {
    this.stopFollow();
    // Route chrome has no ownership of the location compass subscription.
    if (this.overlayShell) {
      this.overlayShell.style.display = "none";
    }
    // Clearing route chrome must not disable the independently tracked position.
    // No coordinate is injected here; the existing GPS/provider remains authority.
    appLog("MapMarker", "Navigation display reset; location marker retained");
  }

  follow(): void {
    this.syncFollowMode(true);
  }

  stopFollow(): void {
    this.followIncludesHeading = false;
    this.blueDot.follow(false);
  }

  /**
   * Follow position immediately. On the idle map, do not lock camera bearing
   * to compass heading: magnetometer noise spins the 2D view while you stand
   * still. Heading-follow is reserved for active navigation.
   */
  private syncFollowMode(force = false): void {
    const headingReady =
      this.simulatorDrivesAvatar &&
      ((this.lastPosition?.heading != null &&
        Number.isFinite(this.lastPosition.heading)) ||
        (this.lastDeviceHeading != null &&
          Number.isFinite(this.lastDeviceHeading)));
    if (
      !force &&
      this.blueDot.isFollowing &&
      this.followIncludesHeading === headingReady
    ) {
      return;
    }
    this.followIncludesHeading = headingReady;
    // Short settle on first lock; never re-animate while already following.
    const duration = force && !this.blueDot.isFollowing ? 350 : 0;
    this.blueDot.follow(
      headingReady ? "position-and-heading" : "position-only",
      {
        zoomLevel: 20,
        pitch: 45,
        duration,
      },
    );
  }

  focusOnUser(): void {
    const coordinate =
      this.blueDot.coordinate ?? this.lastPosition?.mapCoordinate;
    if (!coordinate) return;
    this.mapView.Camera?.focusOn?.(coordinate, { maxZoomLevel: 20 });
  }

  /** Restore the visible navigation avatar after ambient/simulator boot hides it. */
  private enableVisibleBlueDot(): void {
    if (this.blueDot.isEnabled && this.navigationAppearance) return;
    this.navigationAppearance = true;
    if (this.blueDot.isEnabled) {
      this.blueDot.updateState({ ...this.visibleBlueDotState });
      return;
    }
    this.blueDot.enable({
      watchDevicePosition: false,
      ...this.visibleBlueDotState,
    });
  }

  /**
   * Gate raw device-geolocation fixes so the dot stays planted while the
   * phone is stationary. Indoors, consecutive GPS fixes scatter by tens of
   * metres; without this the blue dot visibly wanders on the idle map.
   * Held fixes are clamped to the anchor (not discarded) so the Blue Dot's
   * inactivity timeout keeps being fed.
   */
  private installStationaryPositionProcessor(): void {
    this.stationaryFilter.reset();
    const last = this.lastPosition?.coordinate;
    if (
      last &&
      Number.isFinite(last.latitude) &&
      Number.isFinite(last.longitude)
    ) {
      this.stationaryFilter.process({
        latitude: last.latitude,
        longitude: last.longitude,
        accuracy: this.lastPosition?.accuracy,
        timestamp: this.lastPositionFixTimestamp ?? undefined,
      });
    }
    this.blueDot.setPositionProcessor((_current, incoming) => {
      if (
        typeof incoming.latitude !== "number" ||
        typeof incoming.longitude !== "number"
      ) {
        return incoming;
      }
      const stabilized = this.stationaryFilter.process({
        latitude: incoming.latitude,
        longitude: incoming.longitude,
        timestamp: typeof incoming.timestamp === 'number' ? incoming.timestamp : undefined,
        accuracy:
          typeof incoming.accuracy === "number" ? incoming.accuracy : undefined,
      });
      const { fix, held } = stabilized;
      if (stabilized.reason === 'non-increasing-timestamp') return undefined;
      this.pendingNativeFixTimestamp = typeof incoming.timestamp === 'number' ? incoming.timestamp : null;
      navDiag?.update('mappedin-filter', 'BlueDot.stationaryProcessor', { raw: { latitude: incoming.latitude, longitude: incoming.longitude, accuracy: incoming.accuracy }, filtered: fix, ...stabilized });
      const heading = this.headingForDevicePosition(incoming.heading);
      const { heading: _incomingHeading, ...position } = incoming;
      if (!held) {
        return {
          ...position,
          ...(heading != null ? { heading } : {}),
        };
      }
      return {
        ...position,
        latitude: fix.latitude,
        longitude: fix.longitude,
        // Geographic stabilization must not improve the reported uncertainty.
        accuracy: incoming.accuracy,
        ...(heading != null ? { heading } : {}),
      };
    });
  }

  stopTracking(): void {
    this.detachRawHeadingListener();
    navDiag?.record('renderer-lifecycle', 'MapMarkerService.stopTracking', { reason: 'tracking-stop', coordinateRetained: !!this.lastPosition });
    this.headingGeneration += 1;
    this.headingStart = null;
    this.trackingGeneration += 1;
    this.trackingStart = null;
    this.blueDot.watchDevicePosition(false);
    this.blueDot.setPositionProcessor(undefined);
    this.stationaryFilter.reset();
    this.blueDot.Sensors.get("geolocation")?.disable();
    this.blueDot.Sensors.get("deviceorientation")?.disable();
    this.blueDot.watchDeviceOrientation(false).catch(() => undefined);
    this.deviceHeadingActive = false;
    this.lastDeviceHeading = null;
    this.stopHeadingAnimation();
    this.compassFilter.reset();
    this.stopFollow();
    this.tracking = false;
    this.onStatus?.("off");
    appLog("MapMarker", "Tracking stopped");
  }

  destroy(): void {
    navDiag?.record('renderer-lifecycle', 'MapMarkerService.destroy', { reason: 'map-teardown', destroyed: true });
    this.destroyed = true;
    this.stopTracking();
    this.overlayShell?.remove();
    this.overlayShell = null;
    this.overlayArrow = null;
    this.blueDot.disable();
    this.blueDot.destroy();
  }

  /**
   * Mappedin now validates `heading` as numeric. Omit it until compass or a
   * previous published heading is available.
   */
  private headingForDevicePosition(
    _incoming?: number | "device" | null,
  ): number | undefined {
    if (
      this.lastDeviceHeading != null &&
      Number.isFinite(this.lastDeviceHeading)
    ) {
      return this.lastDeviceHeading;
    }
    if (
      this.lastPublishedHeading != null &&
      Number.isFinite(this.lastPublishedHeading)
    ) {
      return this.lastPublishedHeading;
    }
    return undefined;
  }

  private isCompassDrivingCone(): boolean {
    return (!this.simulatorDrivesAvatar || this.compassGlow || TEMP_COMPASS_GLOW_OVER_SIM_HEADING) &&
      this.deviceHeadingActive && this.compassFilter.isLocked() && this.lastDeviceHeading != null &&
      this.lastHeadingEventAt != null && Date.now() - this.lastHeadingEventAt <= COMPASS_FRESH_MS;
  }

  private setConeHeadingTarget(heading: number): void {
    const deg = normalizeHeadingDegrees(heading);
    this.headingTarget = deg;
    if (this.visualHeading == null) {
      this.visualHeading = deg;
      this.publishConeHeading(deg, true);
      return;
    }
    this.startHeadingAnimation();
  }

  private startHeadingAnimation(): void {
    if (this.headingRaf) return;
    const raf =
      typeof globalThis.requestAnimationFrame === "function"
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : null;
    if (!raf) {
      if (this.headingTarget != null) {
        this.visualHeading = this.headingTarget;
        this.publishConeHeading(this.headingTarget, true);
      }
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      this.headingRaf = 0;
      if (this.visualHeading == null || this.headingTarget == null) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      this.visualHeading = stepVisualHeading(
        this.visualHeading,
        this.headingTarget,
        dt,
      );
      this.publishConeHeading(this.visualHeading, false);
      const remaining = Math.abs(
        shortestHeadingDelta(this.visualHeading, this.headingTarget),
      );
      if (remaining > 0.2) {
        this.headingRaf = raf(tick);
      }
    };
    this.headingRaf = raf(tick);
  }

  private stopHeadingAnimation(): void {
    if (this.headingRaf) {
      const cancel =
        typeof globalThis.cancelAnimationFrame === "function"
          ? globalThis.cancelAnimationFrame.bind(globalThis)
          : null;
      cancel?.(this.headingRaf);
      this.headingRaf = 0;
    }
    this.headingTarget = null;
    this.visualHeading = null;
    this.lastPublishedHeading = null;
  }

  private publishConeHeading(heading: number, force: boolean): void {
    const now = performance.now();
    if (!force && this.lastPublishedHeading != null) {
      const delta = Math.abs(
        shortestHeadingDelta(this.lastPublishedHeading, heading),
      );
      if (
        delta < HEADING_PUBLISH_MIN_DELTA_DEG &&
        now - this.lastHeadingPublishAt < HEADING_PUBLISH_MIN_INTERVAL_MS
      ) {
        return;
      }
    }
    this.lastPublishedHeading = heading;
    this.lastHeadingPublishAt = now;
    this.applyHeading(heading);
    if (!this.blueDot.isEnabled) return;
    this.blueDot.update({ heading }, { silent: true, animate: false });
    this.lastSdkSubmittedHeading = heading;
    navDiag?.sample('compass-publish', 'MapMarkerService', { sdkHeading: heading, target: this.headingTarget,
      source: this.headingSource, cameraBearing: this.mapView.Camera?.bearing ?? null,
      expectedVisualHeading: normalizeHeadingDegrees(heading - (this.mapView.Camera?.bearing ?? 0)),
      positionChanged: false, headingOnly: true, simulatedAnglesTranslated: false });
  }

  /**
   * Mappedin hides the glow when `heading` is `undefined` or `'device'` with no
   * compass sample yet. Use a settled compass when we have one; otherwise the
   * path/GPS bearing so the cone does not jump to an uncalibrated reading.
   */
  private resolveConeHeading(fallback?: number | null): number | undefined {
    const compassReady =
      this.deviceHeadingActive &&
      this.compassFilter.isLocked() &&
      this.lastDeviceHeading != null &&
      Number.isFinite(this.lastDeviceHeading);

    return resolveNavigationConeHeading({
      compassHeading: compassReady ? this.lastDeviceHeading : null,
      compassAgeMs: compassReady && this.lastHeadingEventAt != null ? Date.now() - this.lastHeadingEventAt : null,
      pathHeading: fallback,
    });
  }

  private pushConeHeading(heading: number): void {
    this.setConeHeadingTarget(heading);
  }

  private mountCustomOverlay(): void {
    const container = document.querySelector(
      "#mappedin-map",
    ) as HTMLElement | null;
    if (!container || document.getElementById(MARKER_OVERLAY_ID)) return;

    const shell = document.createElement("div");
    shell.id = MARKER_OVERLAY_ID;
    shell.className = "fplaces-nav-marker-shell";
    shell.innerHTML = `
      <div class="fplaces-nav-marker-avatar" aria-hidden="true"></div>
      <div class="fplaces-nav-marker-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
          <path fill="currentColor" d="M12 2 L20 20 L12 16 L4 20 Z"/>
        </svg>
      </div>
    `;
    container.appendChild(shell);
    this.overlayShell = shell;
    this.overlayArrow = shell.querySelector(".fplaces-nav-marker-arrow");
    shell.style.display = "none";
  }

  private wireEvents(): void {
    this.blueDot.on("position-update", (event) => {
      if (this.simulatorDrivesAvatar) return;
      const heading =
        this.deviceHeadingActive && this.lastDeviceHeading != null
          ? this.lastDeviceHeading
          : event.heading;
      this.lastPositionFixTimestamp = this.pendingNativeFixTimestamp;
      this.lastPositionReceivedAt = Date.now();
      const position = this.toPosition(
        event.coordinate,
        event.accuracy,
        heading,
        event.floor?.id,
      );
      this.lastPosition = position;
      this.setPositionAvailability(event.accuracy != null && event.accuracy <= 30 ? 'live' : 'approximate');
      this.recordRendererSubmission(event.coordinate, 'accepted-native-sdk-position');
      if (heading != null) this.applyHeading(heading);
      this.onPosition?.(position);
    });

    this.blueDot.on("device-orientation-update", (event) => {
      if (
        this.simulatorDrivesAvatar &&
        !this.compassGlow &&
        !TEMP_COMPASS_GLOW_OVER_SIM_HEADING
      ) {
        return;
      }
      if (event.heading == null || !Number.isFinite(event.heading)) return;
      // SDK emits only while active; raw absolute events are the authority when
      // available and keep the original cone turning at a retained position.
      if (this.rawHeadingHandler) return;
      const heading = this.compassFilter.ingestHeading(event.heading);
      if (heading != null) this.acceptCompassHeading(heading, 'sdk-compass');
    });

    this.blueDot.on("dot-position-update", (event) => {
      navDiag?.sample('renderer-callback', 'MapMarkerService.dot-position-update', { sdkAnimatedCoordinate: { latitude: event.position.latitude, longitude: event.position.longitude },
        acceptedCoordinate: this.lastPosition?.coordinate, reason: 'SDK-interpolation-is-not-a-new-GPS-fix', movementEvidence: false });
      // Animation callbacks describe display interpolation. They must not replace
      // the accepted provider position or drop its floor, accuracy and heading.
      if (this.simulatorDrivesAvatar) return;
      const position = this.toPosition(event.position, this.lastPosition?.accuracy,
        this.visualHeading ?? this.lastPosition?.heading, event.position.floorId ?? this.lastPosition?.floorId);
      this.lastPosition = position;
      if (
        position.heading != null &&
        !this.simulatorDrivesAvatar &&
        !this.deviceHeadingActive
      ) {
        this.applyHeading(position.heading);
      }
      if (!this.simulatorDrivesAvatar) {
        this.onAnimatedPosition?.(position);
      }
    });

    this.blueDot.on("status-change", ({ status }) => {
      recordLocationDiagnostic('blue-dot-renderer-status', { status, providerDriven: this.simulatorDrivesAvatar,
        hasPosition: !!this.lastPosition, floorMatchesView: !this.lastPosition?.floorId || this.lastPosition.floorId === this.mapView.currentFloor?.id });
      navDiag?.update('blue-dot-renderer', 'BlueDot.status-change', { status, enabled: this.blueDot.isEnabled,
        hasPosition: !!this.lastPosition, floorId: this.lastPosition?.floorId ?? null, viewFloorId: this.mapView.currentFloor?.id ?? null,
        renderer: this.getLocationDiagnosticSnapshot(), visibilityEvidence: 'SDK state; on-screen pixels not verified' });
      if (status === 'inactive') this.setPositionAvailability('retained');
      if (!this.tracking && !this.simulatorDrivesAvatar) {
        this.onStatus?.("off");
        return;
      }
      if (status === "active") this.onStatus?.("active");
      else if (status === "inactive") this.onStatus?.("inactive");
      else if (status === "disabled") this.onStatus?.("off");
    });

    this.blueDot.on("error", (error) => {
      recordLocationDiagnostic('blue-dot-unavailable', { reason: 'sdk-geolocation-error' });
      appWarn("MapMarker", "Geolocation error", error);
      this.onStatus?.("error");
    });
  }

  private toPosition(
    coordinate: Coordinate,
    accuracy?: number | null,
    heading?: number | null,
    floorId?: string,
  ): BlueDotPosition {
    const floor =
      floorId ??
      (coordinate.floorId != null ? String(coordinate.floorId) : undefined);

    return {
      coordinate: {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        floorId: floor ?? "unknown",
      },
      mapCoordinate: coordinate,
      accuracy: accuracy ?? undefined,
      heading: heading ?? undefined,
      floorId: floor,
      timestamp: this.lastPositionFixTimestamp ?? undefined,
    };
  }
}

/** @deprecated Use MapMarkerService */
export { MapMarkerService as BlueDotService };
