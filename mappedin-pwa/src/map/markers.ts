import { PositionInterpolation } from "../position/physical-walk/render-interpolation";
import { BlueDot } from "@mappedin/blue-dot";
import type { Coordinate, MapView } from "@mappedin/mappedin-js";

import type { FplacesPositionFrame } from "../position/types";
import {
  COMPASS_FRESH_MS,
  createCompassHeadingFilter,
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

/**
 * Injected live frames are already snapped onto the route, so raw GPS accuracy
 * (often 50–500 m indoors) is display noise. Capping it keeps the accuracy ring
 * sane and keeps fixes under the blue-dot accuracy threshold, which silently
 * drops any update above ~50 m - the reason live positions never applied.
 */
const MAX_INJECTED_ACCURACY_METERS = 30;

export type HeadingDiagnostic = (type: string, data: Record<string, unknown>) => void;

export class MapMarkerService {
  private readonly blueDot: BlueDot;
  private tracking = false;
  private positionDiagnostic: HeadingDiagnostic | null = null;
  private positionDiagnosticReadAt = new Map<string, number>();
  private auditInterpolatedRequest: { latitude: number; longitude: number } | null = null;
  private lastAuditDraw: { latitude: number; longitude: number; at: number } | null = null;
  /** Read-only diagnostic attachment: no SDK options, sensors or rendering changes. */
  setPositionDiagnostics(listener: HeadingDiagnostic | null): void {
    this.positionDiagnostic = listener;
    this.positionDiagnosticReadAt.clear();
    if (listener) this.positionEvent("position.audit.attached", {}, true);
  }
  private positionEvent(type: string, data: Record<string, unknown>, force = false): void {
    if (!this.positionDiagnostic) return;
    const now = Date.now();
    if (!force && now - (this.positionDiagnosticReadAt.get(type) ?? -Infinity) < 250) return;
    this.positionDiagnosticReadAt.set(type, now);
    try {
      const sdk = this.blueDot.coordinate;
      const model = this.blueDot.dotModel;
      let modelPosition: { latitude?: number; longitude?: number; floorId?: string } | undefined;
      try { if (model) modelPosition = this.mapView.getState?.(model)?.position; } catch { /* Not observable. */ }
      this.positionDiagnostic(type, { interpolatedLatitude: this.auditInterpolatedRequest?.latitude, interpolatedLongitude: this.auditInterpolatedRequest?.longitude, ...data,
        sdkFloorId: sdk?.floorId, modelFloorId: modelPosition?.floorId, currentFloorId: this.mapView.currentFloor?.id,
        sdkLatitude: sdk?.latitude, sdkLongitude: sdk?.longitude,
        modelLatitude: modelPosition?.latitude, modelLongitude: modelPosition?.longitude,
        modelObservable: Number.isFinite(modelPosition?.latitude) && Number.isFinite(modelPosition?.longitude), pixelPositionObservable: false,
        sdkStatus: this.blueDot.status, parallel: this.simulatorDrivesAvatar,
        sdkGpsEnabled: this.blueDot.Sensors.get("geolocation")?.isEnabled,
        sdkOrientationEnabled: this.blueDot.Sensors.get("deviceorientation")?.isEnabled,
        headingAgeMs: this.lastHeadingEvidenceAt == null ? undefined : now - this.lastHeadingEvidenceAt,
        cameraBearing: this.mapView.Camera?.bearing, cameraPitch: this.mapView.Camera?.pitch,
        cameraZoom: this.mapView.Camera?.zoomLevel });
    } catch { /* Diagnostics cannot interrupt a navigation writer. */ }
  }

  setPhysicalWalkRoute(path: RouteCoordinate[] | null): void {
    this.stopPhysicalRendering(); this.physicalInterpolation.setRoute(path);
  }
  private readonly physicalInterpolation = new PositionInterpolation();
  private physicalRenderRaf = 0;
  private physicalRenderGeneration = 0;
  private physicalRenderActive = false;

  private stopPhysicalRendering(): void {
    this.physicalRenderGeneration++;
    this.positionEvent("position.audit.animation-cancel", { reason: "render-owner-stop" }, true);
    if (this.physicalRenderRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.physicalRenderRaf);
    this.physicalRenderRaf = 0; this.physicalRenderActive = false;
    this.physicalInterpolation.reset();
  }

  private renderPhysicalPosition(frame: FplacesPositionFrame): void {
    this.physicalRenderActive = true;
    const generation = ++this.physicalRenderGeneration;
    const now = performance.now();
    this.physicalInterpolation.setTarget(frame, now);
    const start = this.physicalInterpolation.sample(now);
    this.positionEvent("position.audit.animation-target", { fixTimestamp: frame.timestamp,
      acceptedLatitude: frame.latitude, acceptedLongitude: frame.longitude,
      animationStartLatitude: start?.latitude, animationStartLongitude: start?.longitude,
      lastDrawnLatitude: this.lastAuditDraw?.latitude, lastDrawnLongitude: this.lastAuditDraw?.longitude,
      frameGapMs: this.lastAuditDraw ? now - this.lastAuditDraw.at : undefined,
      durationMs: this.physicalInterpolation.durationMs }, true);
    this.headingEvent("marker.target", { venueLatitude: frame.latitude, venueLongitude: frame.longitude,
      fixTimestamp: frame.timestamp, durationMs: this.physicalInterpolation.durationMs, reason: "accepted-unsnapped-authority" });
    if (this.physicalRenderRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.physicalRenderRaf);
    const draw = (at: number) => {
      if (generation !== this.physicalRenderGeneration) return;
      this.physicalRenderRaf = 0;
      if (!this.physicalRenderActive || !this.simulatorDrivesAvatar) return;
      const point = this.physicalInterpolation.sample(at);
      if (!point) return;
      // No heading overwrite, no SDK tween: preserve independent live compass updates.
      // SDK position callbacks are suppressed by parallel mode and never drive navigation.
      this.auditInterpolatedRequest = { ...point };
      this.blueDot.update({ latitude: point.latitude, longitude: point.longitude,
        floorOrFloorId: point.floorId, accuracy: frame.accuracy }, { animate: false });
      this.physicalInterpolation.markRendered(point);
      this.positionEvent(this.physicalInterpolation.complete(at) ? "position.audit.animation-complete" : "position.audit.marker-frame", {
        interpolatedLatitude: point.latitude, interpolatedLongitude: point.longitude,
        frameGapMs: this.lastAuditDraw ? at - this.lastAuditDraw.at : undefined,
        reason: "after-sdk-update-call", fixTimestamp: frame.timestamp }, this.physicalInterpolation.complete(at));
      this.lastAuditDraw = { ...point, at };
      const displayed = this.blueDot.coordinate;
      const readback = { displayLatitude: displayed?.latitude, displayLongitude: displayed?.longitude };
      this.headingEvent("marker.render", { ...readback, renderLatitude: point.latitude, renderLongitude: point.longitude,
        reason: "presentation-only-no-progress" });
      if (this.physicalInterpolation.complete(at)) {
        this.headingEvent("marker.render-complete", { ...readback, renderLatitude: point.latitude, renderLongitude: point.longitude,
          reason: "accepted-endpoint-reached-no-extrapolation" });
      }
      if (!this.physicalInterpolation.complete(at) && typeof requestAnimationFrame === "function") {
        this.physicalRenderRaf = requestAnimationFrame(draw);
      }
    };
    if (typeof requestAnimationFrame === "function") draw(now);
    else draw(now + this.physicalInterpolation.durationMs); // Non-browser/test fallback reaches the accepted endpoint.
  }

  private headingGeneration = 0;
  private headingDiagnostic: HeadingDiagnostic | null = null;
  private removeRawHeadingDiagnostic: (() => void) | null = null;
  private headingHealthTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeadingEvidenceAt: number | null = null;
  private headingWasFresh: boolean | null = null;
  private glowModel: unknown;
  private lastGlowVisible: boolean | undefined;
  private headingWanted = false;
  private demoRendererState: { timeout: number; preventOutOfBounds: boolean } | null = null;

  /** Demo-only instrumentation/liveness policy; uses existing SDK sensor and renderer. */
  setHeadingDiagnostics(listener: HeadingDiagnostic | null): void {
    this.headingEvent("heading.diagnostics-stop", { reason: listener ? "diagnostic-owner-replaced" : "demo-release" });
    this.removeRawHeadingDiagnostic?.(); this.removeRawHeadingDiagnostic = null;
    if (this.headingHealthTimer) clearInterval(this.headingHealthTimer);
    this.headingHealthTimer = null;
    if (listener && !this.demoRendererState) {
      const state = this.blueDot.getState?.();
      this.demoRendererState = { timeout: state?.timeout ?? NAV_BLUE_DOT_STATE.timeout,
        preventOutOfBounds: state?.preventOutOfBounds ?? true };
    }
    this.headingDiagnostic = listener;
    this.lastHeadingEvidenceAt = null; this.headingWasFresh = null;
    if (!listener) {
      if (this.demoRendererState) this.blueDot.updateState(this.demoRendererState);
      this.demoRendererState = null;
      return;
    }
    if (this.blueDot.isEnabled) this.blueDot.updateState({ timeout: Infinity, preventOutOfBounds: false });
    const sensor = this.blueDot.Sensors.get("deviceorientation");
    const removeBrowserEvents: Array<() => void> = [];
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      const browserEvent = (event: DeviceOrientationEvent) => {
        this.headingEvent("orientation.browser-event", { heading: event.webkitCompassHeading,
          alpha: event.alpha, absolute: event.absolute, reason: event.type });
      };
      for (const type of ["deviceorientation", "deviceorientationabsolute"]) {
        window.addEventListener(type, browserEvent as EventListener, true);
        removeBrowserEvents.push(() => window.removeEventListener(type, browserEvent as EventListener, true));
      }
    }
    if (sensor) {
      const raw = (event: { update: { heading?: number | null } }) => {
        const heading = event.update.heading;
        if (heading == null || !Number.isFinite(heading)) return;
        this.lastHeadingEvidenceAt = Date.now();
        this.headingEvent("heading.raw", { heading, reason: "existing-sdk-orientation-sensor" });
      };
      sensor.on?.("absolute-update", raw);
      this.removeRawHeadingDiagnostic = () => { sensor.off?.("absolute-update", raw); for (const remove of removeBrowserEvents) remove(); };
    }
    if (!sensor) this.removeRawHeadingDiagnostic = () => { for (const remove of removeBrowserEvents) remove(); };
    this.headingEvent("heading.diagnostics-start", { reason: "physical-walk-acquisition" });
    this.headingHealthTimer = setInterval(() => {
      this.glowEvent("heading-health-check");
      const age = this.lastHeadingEvidenceAt == null ? null : Date.now() - this.lastHeadingEvidenceAt;
      const fresh = age != null && age <= COMPASS_FRESH_MS;
      if (fresh !== this.headingWasFresh) {
        this.headingWasFresh = fresh;
        this.headingEvent("heading.freshness", { headingAgeMs: age, headingFresh: fresh,
          reason: fresh ? "orientation-evidence" : "no-heading-within-4000ms-hold-last-direction" });
      }
    }, 500);
  }

  private headingEvent(type: string, data: Record<string, unknown>): void {
    this.headingDiagnostic?.(type, { ...data, headingActive: this.deviceHeadingActive,
      positionOwner: this.simulatorDrivesAvatar ? "injected-position" : "device-position" });
  }

  private glowEvent(reason: string): void {
    if (!this.headingDiagnostic) return;
    const model = this.blueDot.headingConeModel;
    if (model && model !== this.glowModel) {
      this.glowModel = model; this.headingEvent("glow.created", { reason });
    }
    if (!model && this.glowModel) {
      this.glowModel = undefined;
      this.headingEvent("glow.removed", { reason, modelPresent: false });
    }
    if (model) {
      try {
        const state = this.mapView.getState?.(model);
        const visible = state?.visible;
        if (typeof visible === "boolean" && visible !== this.lastGlowVisible) {
          this.lastGlowVisible = visible;
          this.headingEvent("glow.visibility", { visible, reason, source: "sdk-model-state" });
        }
      } catch { this.headingEvent("glow.inspect-unavailable", { reason }); }
    }
    if (reason === "heading-health-check") return;
    this.headingEvent("glow.updated", { reason, heading: this.lastPublishedHeading ?? this.lastDeviceHeading,
      modelPresent: !!model });
  }

  private simulatorDrivesAvatar = false;
  private compassGlow = false;
  private deviceHeadingActive = false;
  private lastDeviceHeading: number | null = null;
  private visualHeading: number | null = null;
  private headingTarget: number | null = null;
  private headingRaf = 0;
  private lastPublishedHeading: number | null = null;
  private lastHeadingPublishAt = 0;
  private followIncludesHeading = false;
  private readonly compassFilter = createCompassHeadingFilter();
  private readonly stationaryFilter = createStationaryPositionFilter();
  private lastPosition: BlueDotPosition | null = null;
  private overlayShell: HTMLElement | null = null;
  private overlayArrow: HTMLElement | null = null;
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
    if (options?.simulatorBoot) {
      this.blueDot.disable();
      if (this.overlayShell) this.overlayShell.style.display = "none";
      appLog(
        "MapMarker",
        "Prepared (native Blue Dot suppressed for simulator)",
      );
      return;
    }

    this.headingEvent("glow.visibility", { visible: false, reason: "ambient-prepare" });
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

  private enableSimulatorBlueDot(): void {
    this.headingEvent("glow.visibility", { visible: true, reason: "injected-position-appearance" });
    if (this.blueDot.isEnabled) {
      // prepare() may have booted an ambient dot (transparent core, hidden
      // cone). Without restoring the navigation appearance here, the avatar
      // and directional glow stay invisible for live (non-simulated) routes.
      this.blueDot.updateState({ ...NAV_BLUE_DOT_STATE, ...(this.headingDiagnostic ? { timeout: Infinity, preventOutOfBounds: false } : {}) });
      return;
    }

    this.blueDot.enable({
      watchDevicePosition: false,
      initialState: "hidden",
      ...NAV_BLUE_DOT_STATE,
      ...(this.headingDiagnostic ? { timeout: Infinity, preventOutOfBounds: false } : {}),
    });
  }

  setSimulatorParallelMode(
    active: boolean,
    options?: { compassGlow?: boolean },
  ): void {
    if (this.simulatorDrivesAvatar === active) {
      if (active && options?.compassGlow && !this.compassGlow) {
        this.compassGlow = true;
        void this.enableHeading({ forceDuringSimulator: true });
      }
      return;
    }
    this.positionEvent("position.audit.owner", { reason: active ? "parallel-acquire" : "parallel-release" }, true);
    this.headingGeneration++; // Invalidate older permission/disable completions at ownership handoff.
    this.headingEvent("heading.owner-change", { reason: active ? "injected-provider-acquire" : "injected-provider-release" });
    if (!active) this.stopPhysicalRendering();
    this.simulatorDrivesAvatar = active;
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
    this.headingWanted = false; this.deviceHeadingActive = false;
    this.headingEvent("heading.listener-stop", { reason: "provider-release-sdk-disable" });
    this.headingEvent("glow.removed", { reason: "provider-release-sdk-disable" });
    this.glowModel = undefined;
    this.blueDot.disable();
    this.blueDot.setPositionProcessor(undefined);
    this.stationaryFilter.reset();
    this.stopFollow();
    if (this.overlayShell) this.overlayShell.style.display = "none";
  }

  applyProviderFrame(frame: FplacesPositionFrame): void {
    this.positionEvent("position.audit.writer", { writer: "applyProviderFrame", source: frame.source,
      foreignWriter: this.physicalRenderActive && frame.source !== "physical-gps-transformed",
      venueLatitude: frame.latitude, venueLongitude: frame.longitude, fixTimestamp: frame.timestamp }, true);
    const compassDriving = this.isCompassDrivingCone();
    const resolved = compassDriving
      ? (this.visualHeading ?? this.lastDeviceHeading ?? undefined)
      : this.resolveConeHeading(frame.heading);
    const heading =
      resolved ??
      (this.lastDeviceHeading != null ? this.lastDeviceHeading : undefined);
    const headingForDot = heading ?? this.lastPublishedHeading ?? undefined;
    const isFirstFix = this.lastPosition == null;
    const samePlace =
      this.lastPosition != null &&
      this.lastPosition.coordinate.latitude === frame.latitude &&
      this.lastPosition.coordinate.longitude === frame.longitude;

    if (this.simulatorDrivesAvatar && frame.source === "physical-gps-transformed") {
      this.renderPhysicalPosition(frame);
    } else if (this.simulatorDrivesAvatar) {
      this.blueDot.update(
        {
          latitude: frame.latitude,
          longitude: frame.longitude,
          ...(headingForDot != null ? { heading: headingForDot } : {}),
          accuracy: Math.min(
            frame.accuracy ?? MAX_INJECTED_ACCURACY_METERS,
            MAX_INJECTED_ACCURACY_METERS,
          ),
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

    this.glowEvent("accepted-position-render");
    if (typeof heading === "number") this.applyHeading(heading);
    if (typeof heading === "number" && !compassDriving) {
      this.setConeHeadingTarget(heading);
    }

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
    this.lastPosition = position;
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
    if (heading == null || Number.isNaN(heading)) return;
    const deg = ((heading % 360) + 360) % 360;
    if (this.overlayArrow) {
      this.overlayArrow.style.transform = `rotate(${deg}deg)`;
    }
  }

  /** Compass-only tick: rotate the cone without re-reporting lat/lng. */
  applyHeadingOnly(heading: number | null | undefined): void {
    if (heading == null || Number.isNaN(heading)) return;
    // Compass is already driving the glow; a second GPS/provider heading
    // pipeline is what made the cone flicker between two filters.
    if (this.isCompassDrivingCone()) return;
    this.setConeHeadingTarget(heading);
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

  /**
   * Make the user marker visible and place it at a GPS fix, then pan the camera.
   * Used by the My location control so a tap always shows "you are here".
   */
  showLivePosition(
    input: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      heading?: number | null;
      floorId?: string;
    },
    options?: { follow?: boolean },
  ): void {
    this.positionEvent("position.audit.writer", { writer: "showLivePosition", foreignWriter: this.physicalRenderActive, venueLatitude: input.latitude, venueLongitude: input.longitude }, true);
    this.enableVisibleBlueDot();

    const accuracy = Math.min(
      input.accuracy ?? MAX_INJECTED_ACCURACY_METERS,
      MAX_INJECTED_ACCURACY_METERS,
    );
    const heading =
      input.heading != null && Number.isFinite(input.heading)
        ? ((input.heading % 360) + 360) % 360
        : undefined;
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
    };
    this.stationaryFilter.reset();
    this.stationaryFilter.process({
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy ?? undefined,
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
    this.onStatus?.("starting");
    this.enableVisibleBlueDot();

    const watchGps =
      options?.watchDevicePosition ?? !this.simulatorDrivesAvatar;
    if (watchGps) {
      this.installStationaryPositionProcessor();
      const geolocation = this.blueDot.Sensors.get("geolocation");
      await geolocation?.enable();
      this.blueDot.watchDevicePosition(true);
      await this.enableHeading().catch(() => undefined);
    }

    this.tracking = true;

    if (options?.follow) {
      this.follow();
    }

    appLog("MapMarker", "Tracking started", {
      follow: options?.follow ?? false,
    });
  }

  async enableHeading(options?: {
    forceDuringSimulator?: boolean;
  }): Promise<void> {
    if (
      this.simulatorDrivesAvatar &&
      !options?.forceDuringSimulator &&
      !this.compassGlow &&
      !TEMP_COMPASS_GLOW_OVER_SIM_HEADING
    ) {
      return;
    }

    const generation = ++this.headingGeneration;
    this.headingWanted = true;
    this.headingEvent("orientation.permission", { permission: "requesting", reason: "enable-heading" });
    // Make the cone visible before touching sensors so a compass permission
    // failure still leaves the glow driven by provider frame headings.
    if (this.blueDot.isEnabled) {
      this.blueDot.updateState({ heading: { ...HEADING_CONE } });
      this.headingEvent("glow.visibility", { visible: true, reason: "enable-heading-request" });
    }

    try {
      const orientation = this.blueDot.Sensors.get("deviceorientation");
      // Start the watch in this tick so iOS still counts a user tap as the gesture.
      const watch = this.blueDot.watchDeviceOrientation(true);
      this.headingEvent("heading.listener-start", { reason: "sdk-watch-device-orientation" });
      await watch;
      if (generation !== this.headingGeneration) {
        if (!this.headingWanted) void this.blueDot.watchDeviceOrientation(false);
        return;
      }
      const permission = await orientation?.checkPermission?.() ?? "unknown";
      if (generation !== this.headingGeneration) {
        if (!this.headingWanted) void this.blueDot.watchDeviceOrientation(false);
        return;
      }
      this.headingEvent("orientation.permission", { permission, reason: "sdk-permission-result" });
      if (permission === "denied" || permission === "unavailable") {
        this.deviceHeadingActive = false;
        this.headingEvent("heading.listener-unavailable", { reason: "orientation-permission-" + permission });
        return;
      }
      this.deviceHeadingActive = true;
      const heading = this.resolveConeHeading();
      if (heading != null) this.pushConeHeading(heading);
    } catch (error) {
      if (generation !== this.headingGeneration) {
        if (!this.headingWanted) void this.blueDot.watchDeviceOrientation(false);
        return;
      }
      this.headingEvent("orientation.permission", { permission: "unavailable", reason: "sdk-watch-failed" });
      this.deviceHeadingActive = false;
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

  async disableHeading(): Promise<void> {
    const generation = ++this.headingGeneration;
    this.headingWanted = false;
    this.headingEvent("heading.listener-stop", { reason: "disable-heading" });
    this.deviceHeadingActive = false;
    this.lastDeviceHeading = null;
    this.stopHeadingAnimation();
    this.compassFilter.reset();
    this.blueDot.Sensors.get("deviceorientation")?.disable();
    await this.blueDot.watchDeviceOrientation(false).catch(() => undefined);
    if (generation !== this.headingGeneration) {
      this.headingEvent("heading.stale-completion", { reason: "disable-superseded-by-new-owner" });
      return;
    }
    this.headingEvent("glow.visibility", { visible: false, reason: "explicit-disable-heading" });
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
    this.stopPhysicalRendering();
    this.stopFollow();
    void this.disableHeading();
    if (this.overlayShell) {
      this.overlayShell.style.display = "none";
    }
    if (this.blueDot.isEnabled) {
      this.headingEvent("glow.removed", { reason: "navigation-display-reset" });
      this.blueDot.disable();
    }
    appLog("MapMarker", "Navigation display reset");
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
    if (this.blueDot.isEnabled) {
      this.blueDot.updateState({ ...NAV_BLUE_DOT_STATE, ...(this.headingDiagnostic ? { timeout: Infinity, preventOutOfBounds: false } : {}) });
      return;
    }
    this.blueDot.enable({
      watchDevicePosition: false,
      ...NAV_BLUE_DOT_STATE,
      ...(this.headingDiagnostic ? { timeout: Infinity, preventOutOfBounds: false } : {}),
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
      });
    }
    this.blueDot.setPositionProcessor((_current, incoming) => {
      if (
        typeof incoming.latitude !== "number" ||
        typeof incoming.longitude !== "number"
      ) {
        return incoming;
      }
      const { fix, held } = this.stationaryFilter.process({
        latitude: incoming.latitude,
        longitude: incoming.longitude,
        accuracy:
          typeof incoming.accuracy === "number" ? incoming.accuracy : undefined,
      });
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
        ...(fix.accuracy != null ? { accuracy: fix.accuracy } : {}),
        ...(heading != null ? { heading } : {}),
      };
    });
  }

  stopTracking(): void {
    this.headingGeneration++; this.headingWanted = false;
    this.headingEvent("heading.listener-stop", { reason: "stop-tracking" });
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
    this.stopPhysicalRendering();
    this.setPositionDiagnostics(null);
    this.headingEvent("glow.removed", { reason: "renderer-destroy" });
    this.stopTracking();
    this.setHeadingDiagnostics(null);
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
    return this.compassGlow || TEMP_COMPASS_GLOW_OVER_SIM_HEADING;
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
    this.positionEvent("position.audit.heading-only-writer", { writer: "publishConeHeading", heading });
    this.headingEvent("heading.published", { heading, reason: "existing-compass-filter-and-visual-smoothing" });
    this.glowEvent("heading-only-render");
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
      compassAgeMs: compassReady ? 0 : null,
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
      this.positionEvent("position.audit.sdk-position-event", { callbackLatitude: event.coordinate?.latitude, callbackLongitude: event.coordinate?.longitude });
      if (this.simulatorDrivesAvatar) return;
      const heading =
        this.deviceHeadingActive && this.lastDeviceHeading != null
          ? this.lastDeviceHeading
          : event.heading;
      const position = this.toPosition(
        event.coordinate,
        event.accuracy,
        heading,
        event.floor?.id,
      );
      this.lastPosition = position;
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
      this.lastHeadingEvidenceAt = Date.now();
      this.headingEvent("heading.received", { heading: event.heading, reason: "sdk-device-orientation-update" });
      const heading = this.compassFilter.ingestHeading(event.heading);
      if (heading == null) { this.headingEvent("heading.filter-held", { reason: "compass-settling" }); return; }
      this.headingEvent("heading.filtered", { heading, reason: "existing-compass-filter" });
      this.lastDeviceHeading = heading;
      this.pushConeHeading(heading);
      if (this.lastPosition) {
        this.lastPosition = {
          ...this.lastPosition,
          heading: this.lastDeviceHeading,
        };
      }
    });

    this.blueDot.on("dot-position-update", (event) => {
      this.positionEvent("position.audit.sdk-animation-event", { callbackLatitude: event.position?.latitude, callbackLongitude: event.position?.longitude });
      if (this.physicalRenderActive) return; // Presentation must not replace authoritative position/heading.
      const position = this.toPosition(event.position);
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

    this.blueDot.on("status-change", ({ status, action }) => {
      this.headingEvent("glow.sdk-status", { state: status, reason: "sdk-" + String(action), modelPresent: !!this.blueDot.headingConeModel });
      if (!this.tracking) {
        this.onStatus?.("off");
        return;
      }
      if (status === "active") this.onStatus?.("active");
      else if (status === "inactive") this.onStatus?.("inactive");
      else if (status === "disabled") this.onStatus?.("off");
    });

    this.blueDot.on("error", (error) => {
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
    };
  }
}

/** @deprecated Use MapMarkerService */
export { MapMarkerService as BlueDotService };
