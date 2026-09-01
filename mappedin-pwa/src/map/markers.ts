import { BlueDot } from '@mappedin/blue-dot';
import type { Coordinate, MapView } from '@mappedin/mappedin-js';

import type { FplacesPositionFrame } from '../position/types';
import {
  createCompassHeadingFilter,
  resolveNavigationConeHeading,
} from '../position/domain/cone-heading';
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
  private deviceHeadingActive = false;
  private lastDeviceHeading: number | null = null;
  private readonly compassFilter = createCompassHeadingFilter();
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
      heading: { ...HEADING_CONE, visible: false, opacity: 0 },
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

  setSimulatorParallelMode(active: boolean): void {
    if (this.simulatorDrivesAvatar === active) return;
    this.simulatorDrivesAvatar = active;
    if (active) {
      this.enableSimulatorBlueDot();
      this.blueDot.watchDevicePosition(false);
      this.blueDot.Sensors.get('geolocation')?.disable();
      this.blueDot.setPositionProcessor(undefined);
      if (this.overlayShell) this.overlayShell.style.display = 'none';

      if (TEMP_COMPASS_GLOW_OVER_SIM_HEADING) {
        // Keep simulated position; drive cone from phone compass only.
        void this.enableHeading({ forceDuringSimulator: true });
      } else {
        this.deviceHeadingActive = false;
        this.lastDeviceHeading = null;
        this.compassFilter.reset();
        this.blueDot.Sensors.get('deviceorientation')?.disable();
        this.blueDot.watchDeviceOrientation(false).catch(() => undefined);
      }
      return;
    }

    this.blueDot.disable();
    this.blueDot.setPositionProcessor(undefined);
    this.stopFollow();
    if (this.overlayShell) this.overlayShell.style.display = 'none';
  }

  applyProviderFrame(frame: FplacesPositionFrame): void {
    const heading = this.resolveConeHeading(frame.heading);

    if (this.simulatorDrivesAvatar) {
      this.blueDot.update(
        {
          latitude: frame.latitude,
          longitude: frame.longitude,
          ...(heading != null ? { heading } : {}),
          accuracy: Math.min(
            frame.accuracy ?? MAX_INJECTED_ACCURACY_METERS,
            MAX_INJECTED_ACCURACY_METERS,
          ),
          floorOrFloorId: frame.floorId,
        },
        { animate: true },
      );
    } else {
      this.blueDot.reportPosition({
        latitude: frame.latitude,
        longitude: frame.longitude,
        ...(heading != null ? { heading } : {}),
        accuracy: frame.accuracy,
        confidence: 0.75,
      });
    }

    if (heading != null) this.applyHeading(heading);

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
    this.pushConeHeading(heading);
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
      const geolocation = this.blueDot.Sensors.get('geolocation');
      await geolocation?.enable();
      this.blueDot.watchDevicePosition(true);
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
    this.blueDot.follow('position-and-heading', {
      zoomLevel: 20,
      pitch: 45,
      duration: 800,
    });
  }

  stopFollow(): void {
    this.blueDot.follow(false);
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

  stopTracking(): void {
    this.blueDot.watchDevicePosition(false);
    this.blueDot.Sensors.get('geolocation')?.disable();
    this.blueDot.Sensors.get('deviceorientation')?.disable();
    this.blueDot.watchDeviceOrientation(false).catch(() => undefined);
    this.deviceHeadingActive = false;
    this.lastDeviceHeading = null;
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
    this.applyHeading(heading);
    if (!this.blueDot.isEnabled) return;
    this.blueDot.update({ heading }, { silent: true, animate: false });
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
      if (this.simulatorDrivesAvatar && !TEMP_COMPASS_GLOW_OVER_SIM_HEADING) {
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
