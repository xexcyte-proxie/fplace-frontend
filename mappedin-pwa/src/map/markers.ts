import { BlueDot } from '@mappedin/blue-dot';
import type { Coordinate, MapView } from '@mappedin/mappedin-js';

import type { FplacesPositionFrame } from '../position/types';
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

/**
 * TEMP diagnostic: glow follows phone compass even while Begin uses simulated position.
 * Compare 2D cone vs AR arrows while turning in place (not about movement).
 * Set false to restore path-travel heading on the cone.
 */
const TEMP_COMPASS_GLOW_OVER_SIM_HEADING = true;

const HEADING_CONE = {
  visible: true,
  opacity: 0.7,
  color: '#2266ff',
  displayWhenInactive: true,
} as const;

export class MapMarkerService {
  private readonly blueDot: BlueDot;
  private tracking = false;
  private simulatorDrivesAvatar = false;
  private deviceHeadingActive = false;
  private lastDeviceHeading: number | null = null;
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
    if (!this.blueDot.isEnabled) {
      this.blueDot.enable({
        watchDevicePosition: false,
        visible: true,
        initialState: 'hidden',
        color: '#2266ff',
        heading: { visible: true, opacity: 0.7, color: '#2266ff' },
        accuracyRing: { visible: true, opacity: 0.22, color: '#3b82f6' },
        inactiveColor: '#64748b',
        timeout: 30_000,
      });
    }
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
    if (this.simulatorDrivesAvatar) {
      const useCompassGlow =
        TEMP_COMPASS_GLOW_OVER_SIM_HEADING && this.deviceHeadingActive;
      this.blueDot.update(
        {
          latitude: frame.latitude,
          longitude: frame.longitude,
          // Omit simulated path bearing so the cone tracks the phone.
          ...(useCompassGlow
            ? { heading: 'device' as const }
            : { heading: frame.heading ?? undefined }),
          accuracy: frame.accuracy,
          floorOrFloorId: frame.floorId,
        },
        { animate: true },
      );
    } else {
      // When compass is live, omit GPS course so the heading cone follows the phone.
      const headingForDot = this.deviceHeadingActive
        ? undefined
        : frame.heading;
      if (headingForDot != null) this.applyHeading(headingForDot);
      this.blueDot.reportPosition({
        latitude: frame.latitude,
        longitude: frame.longitude,
        ...(headingForDot != null ? { heading: headingForDot } : {}),
        accuracy: frame.accuracy,
        confidence: 0.75,
      });
    }

    const heading =
      this.deviceHeadingActive && this.lastDeviceHeading != null
        ? this.lastDeviceHeading
        : frame.heading;
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

  async startTracking(options?: { follow?: boolean }): Promise<void> {
    this.onStatus?.('starting');

    if (!this.simulatorDrivesAvatar) {
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

    const orientation = this.blueDot.Sensors.get('deviceorientation');
    await orientation?.enable();
    await this.blueDot.watchDeviceOrientation(true);
    this.deviceHeadingActive = true;

    if (this.blueDot.isEnabled) {
      this.blueDot.updateState({ heading: { ...HEADING_CONE } });
      // Prefer live compass over GPS / simulated path bearing for the cone.
      this.blueDot.update({ heading: 'device' });
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
    const coordinate = this.blueDot.coordinate;
    if (!coordinate) return;
    this.mapView.Camera?.focusOn?.(coordinate, { maxZoomLevel: 20 });
  }

  stopTracking(): void {
    this.blueDot.watchDevicePosition(false);
    this.blueDot.Sensors.get('geolocation')?.disable();
    this.blueDot.Sensors.get('deviceorientation')?.disable();
    this.blueDot.watchDeviceOrientation(false).catch(() => undefined);
    this.deviceHeadingActive = false;
    this.lastDeviceHeading = null;
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
      this.lastDeviceHeading = ((event.heading % 360) + 360) % 360;
      this.applyHeading(this.lastDeviceHeading);
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
