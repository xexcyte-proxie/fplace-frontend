import { BlueDot } from '@mappedin/blue-dot';
import type { Coordinate, MapView } from '@mappedin/mappedin-js';

import type { FplacesPositionFrame } from '../position/types';
import {
  createCompassHeadingFilter,
  HEADING_PUBLISH_MIN_DELTA_DEG,
  HEADING_PUBLISH_MIN_INTERVAL_MS,
  normalizeHeadingDegrees,
  resolveNavigationConeHeading,
  shortestHeadingDelta,
  stepVisualHeading,
} from '../position/domain/cone-heading';
import { createStationaryPositionFilter } from '../position/domain/stationary-position-filter';
import type { RouteCoordinate } from '../types';
import { appLog, appWarn } from '../utils/logger';

export type BlueDotTrackingStatus = 'off' | 'starting' | 'active' | 'inactive' | 'error';

export interface BlueDotPosition {
  coordinate: RouteCoordinate;
  mapCoordinate?: Coordinate;
  accuracy?: number;
  heading?: number;
  floorId?: string;
}

const MARKER_OVERLAY_ID = 'fplaces-nav-marker-overlay';

/** Path/GPS bearing drives the cone during simulated walk; live compass still wins once locked. */
const TEMP_COMPASS_GLOW_OVER_SIM_HEADING = false;

const HEADING_CONE = {
  visible: true,
  opacity: 0.85,
  color: '#2266ff',
  displayWhenInactive: true,
} as const;

/** Blue Dot appearance while navigation frames are injected (sim walk or live IPS). */
const NAV_BLUE_DOT_STATE = {
  visible: true,
  color: '#2266ff',
  heading: { ...HEADING_CONE },
  accuracyRing: { visible: true, opacity: 0.22, color: '#3b82f6' },
  inactiveColor: '#64748b',
  timeout: 30_000,
};

/**
 * Injected live frames are already snapped onto the route, so raw GPS accuracy
 * (often 50–500 m indoors) is display noise. Capping it keeps the accuracy ring
 * sane and keeps fixes under the blue-dot accuracy threshold, which silently
 * drops any update above ~50 m - the reason live positions never applied.
 */
const MAX_INJECTED_ACCURACY_METERS = 30;

export class MapMarkerService {
  private readonly blueDot: BlueDot;
  private tracking = false;
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
      if (this.overlayShell) this.overlayShell.style.display = 'none';
      appLog('MapMarker', 'Prepared (native Blue Dot suppressed for simulator)');
      return;
    }

    this.blueDot.enable({
      watchDevicePosition: false,
      visible: true,
      color: 'transparent',
      // Cone stays ready; device orientation is bound in enableHeading().
      heading: { ...HEADING_CONE },
      accuracyRing: { visible: true, opacity: 0.22, color: '#3b82f6' },
      inactiveColor: '#64748b',
      timeout: 30_000,
    });
    appLog('MapMarker', 'Prepared');
  }

  private enableSimulatorBlueDot(): void {
    if (this.blueDot.isEnabled) {
      // prepare() may have booted an ambient dot (transparent core, hidden
      // cone). Without restoring the navigation appearance here, the avatar
      // and directional glow stay invisible for live (non-simulated) routes.
      this.blueDot.updateState({ ...NAV_BLUE_DOT_STATE });
      return;
    }

    this.blueDot.enable({
      watchDevicePosition: false,
      initialState: 'hidden',
      ...NAV_BLUE_DOT_STATE,
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
    this.simulatorDrivesAvatar = active;
    this.compassGlow = active && options?.compassGlow === true;
    if (active) {
      this.enableSimulatorBlueDot();
      this.blueDot.watchDevicePosition(false);
      this.blueDot.Sensors.get('geolocation')?.disable();
      this.blueDot.setPositionProcessor(undefined);
      this.stationaryFilter.reset();
      if (this.overlayShell) this.overlayShell.style.display = 'none';

      if (this.compassGlow || TEMP_COMPASS_GLOW_OVER_SIM_HEADING) {
        void this.enableHeading({ forceDuringSimulator: true });
      } else {
        this.deviceHeadingActive = false;
        this.lastDeviceHeading = null;
        this.stopHeadingAnimation();
        this.compassFilter.reset();
        this.blueDot.Sensors.get('deviceorientation')?.disable();
        this.blueDot.watchDeviceOrientation(false).catch(() => undefined);
      }
      return;
    }

    this.compassGlow = false;
    this.blueDot.disable();
    this.blueDot.setPositionProcessor(undefined);
    this.stationaryFilter.reset();
    this.stopFollow();
    if (this.overlayShell) this.overlayShell.style.display = 'none';
  }

  applyProviderFrame(frame: FplacesPositionFrame): void {
    const compassDriving = this.isCompassDrivingCone();
    const resolved = compassDriving
      ? (this.visualHeading ?? this.lastDeviceHeading ?? undefined)
      : this.resolveConeHeading(frame.heading);
    const heading =
      resolved ??
      (this.lastDeviceHeading != null ? this.lastDeviceHeading : undefined);
    const headingForDot = heading ?? this.lastPublishedHeading ?? 'device';
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
          heading: headingForDot,
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
        heading: headingForDot,
        accuracy: frame.accuracy,
        confidence: 0.75,
      });
    }

    if (typeof heading === 'number') this.applyHeading(heading);
    if (typeof heading === 'number' && !compassDriving) {
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
        floorId: floorId ?? 'unknown',
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
    this.onStatus?.('starting');
    this.enableVisibleBlueDot();

    const watchGps =
      options?.watchDevicePosition ?? !this.simulatorDrivesAvatar;
    if (watchGps) {
      this.installStationaryPositionProcessor();
      const geolocation = this.blueDot.Sensors.get('geolocation');
      await geolocation?.enable();
      this.blueDot.watchDevicePosition(true);
      await this.enableHeading().catch(() => undefined);
    }

    this.tracking = true;

    if (options?.follow) {
      this.follow();
    }

    appLog('MapMarker', 'Tracking started', { follow: options?.follow ?? false });
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

    // Make the cone visible before touching sensors so a compass permission
    // failure still leaves the glow driven by provider frame headings.
    if (this.blueDot.isEnabled) {
      this.blueDot.updateState({ heading: { ...HEADING_CONE } });
    }

    try {
      const orientation = this.blueDot.Sensors.get('deviceorientation');
      // Start the watch in this tick so iOS still counts a user tap as the gesture.
      const watch = this.blueDot.watchDeviceOrientation(true);
      const enable = orientation?.enable() ?? Promise.resolve();
      await Promise.all([watch, enable]);
      this.deviceHeadingActive = true;
      const heading = this.resolveConeHeading();
      if (heading != null) this.pushConeHeading(heading);
    } catch (error) {
      this.deviceHeadingActive = false;
      appWarn('MapMarker', 'Compass unavailable - cone follows provider heading', error);
      return;
    }

    if (this.overlayArrow) {
      this.overlayArrow.style.display = '';
    }
    appLog('MapMarker', 'Device heading enabled', {
      compassOverSim: TEMP_COMPASS_GLOW_OVER_SIM_HEADING,
    });
  }

  async disableHeading(): Promise<void> {
    this.deviceHeadingActive = false;
    this.lastDeviceHeading = null;
    this.stopHeadingAnimation();
    this.compassFilter.reset();
    this.blueDot.Sensors.get('deviceorientation')?.disable();
    await this.blueDot.watchDeviceOrientation(false).catch(() => undefined);
    if (this.blueDot.isEnabled) {
      this.blueDot.updateState({
        heading: { visible: false, opacity: 0 },
      });
    }
    if (this.overlayArrow) {
      this.overlayArrow.style.display = 'none';
    }
    appLog('MapMarker', 'Device heading disabled');
  }

  resetNavigationDisplay(): void {
    this.stopFollow();
    void this.disableHeading();
    if (this.overlayShell) {
      this.overlayShell.style.display = 'none';
    }
    if (this.blueDot.isEnabled) {
      this.blueDot.disable();
    }
    appLog('MapMarker', 'Navigation display reset');
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
        (this.lastDeviceHeading != null && Number.isFinite(this.lastDeviceHeading)));
    if (!force && this.blueDot.isFollowing && this.followIncludesHeading === headingReady) {
      return;
    }
    this.followIncludesHeading = headingReady;
    this.blueDot.follow(headingReady ? 'position-and-heading' : 'position-only', {
      zoomLevel: 20,
      pitch: 45,
      duration: 800,
    });
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
      this.blueDot.updateState({ ...NAV_BLUE_DOT_STATE });
      return;
    }
    this.blueDot.enable({
      watchDevicePosition: false,
      ...NAV_BLUE_DOT_STATE,
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
        typeof incoming.latitude !== 'number' ||
        typeof incoming.longitude !== 'number'
      ) {
        return incoming;
      }
      const { fix, held } = this.stationaryFilter.process({
        latitude: incoming.latitude,
        longitude: incoming.longitude,
        accuracy:
          typeof incoming.accuracy === 'number' ? incoming.accuracy : undefined,
      });
      const heading = this.headingForDevicePosition(incoming.heading);
      if (!held) {
        return { ...incoming, heading };
      }
      return {
        ...incoming,
        latitude: fix.latitude,
        longitude: fix.longitude,
        ...(fix.accuracy != null ? { accuracy: fix.accuracy } : {}),
        heading,
      };
    });
  }

  stopTracking(): void {
    this.blueDot.watchDevicePosition(false);
    this.blueDot.setPositionProcessor(undefined);
    this.stationaryFilter.reset();
    this.blueDot.Sensors.get('geolocation')?.disable();
    this.blueDot.Sensors.get('deviceorientation')?.disable();
    this.blueDot.watchDeviceOrientation(false).catch(() => undefined);
    this.deviceHeadingActive = false;
    this.lastDeviceHeading = null;
    this.stopHeadingAnimation();
    this.compassFilter.reset();
    this.stopFollow();
    this.tracking = false;
    this.onStatus?.('off');
    appLog('MapMarker', 'Tracking stopped');
  }

  destroy(): void {
    this.stopTracking();
    this.overlayShell?.remove();
    this.overlayShell = null;
    this.overlayArrow = null;
    this.blueDot.disable();
    this.blueDot.destroy();
  }

  /**
   * Mappedin hides the glow when `heading` is `undefined`/`null`.
   * GPS `coords.heading` is null while stationary, so the processor must not
   * forward that through: use `'device'` so the compass cone stays on.
   */
  private headingForDevicePosition(
    _incoming?: number | 'device' | null,
  ): number | 'device' {
    if (this.lastDeviceHeading != null && Number.isFinite(this.lastDeviceHeading)) {
      return this.lastDeviceHeading;
    }
    if (this.lastPublishedHeading != null && Number.isFinite(this.lastPublishedHeading)) {
      return this.lastPublishedHeading;
    }
    return 'device';
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
      typeof globalThis.requestAnimationFrame === 'function'
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
      this.visualHeading = stepVisualHeading(this.visualHeading, this.headingTarget, dt);
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
        typeof globalThis.cancelAnimationFrame === 'function'
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
      const delta = Math.abs(shortestHeadingDelta(this.lastPublishedHeading, heading));
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
    const container =
      document.querySelector('#mappedin-map') as HTMLElement | null;
    if (!container || document.getElementById(MARKER_OVERLAY_ID)) return;

    const shell = document.createElement('div');
    shell.id = MARKER_OVERLAY_ID;
    shell.className = 'fplaces-nav-marker-shell';
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
    this.overlayArrow = shell.querySelector('.fplaces-nav-marker-arrow');
    shell.style.display = 'none';
  }

  private wireEvents(): void {
    this.blueDot.on('position-update', (event) => {
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

    this.blueDot.on('device-orientation-update', (event) => {
      if (
        this.simulatorDrivesAvatar &&
        !this.compassGlow &&
        !TEMP_COMPASS_GLOW_OVER_SIM_HEADING
      ) {
        return;
      }
      if (event.heading == null || Number.isNaN(event.heading)) return;
      const heading = this.compassFilter.ingestHeading(event.heading);
      if (heading == null) return;
      this.lastDeviceHeading = heading;
      this.pushConeHeading(heading);
      if (this.lastPosition) {
        this.lastPosition = {
          ...this.lastPosition,
          heading: this.lastDeviceHeading,
        };
      }
    });

    this.blueDot.on('dot-position-update', (event) => {
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

    this.blueDot.on('status-change', ({ status }) => {
      if (!this.tracking) {
        this.onStatus?.('off');
        return;
      }
      if (status === 'active') this.onStatus?.('active');
      else if (status === 'inactive') this.onStatus?.('inactive');
      else if (status === 'disabled') this.onStatus?.('off');
    });

    this.blueDot.on('error', (error) => {
      appWarn('MapMarker', 'Geolocation error', error);
      this.onStatus?.('error');
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
        floorId: floor ?? 'unknown',
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
