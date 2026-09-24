import { PositionProvider, type PositionProviderStartOptions } from '../positionProvider';
import type { FplacesPositionFrame } from '../types';
import {
  createCompassHeadingFilter,
  headingFromGeolocationCourse,
  readScreenOrientationDeg,
} from '../domain/cone-heading';
import { appWarn } from '../../utils/logger';

export class GpsPositionProvider extends PositionProvider {
  readonly source: FplacesPositionFrame['source'] = 'gps';

  private watchId: number | null = null;
  private orientationHandler: ((event: DeviceOrientationEvent) => void) | null = null;
  private readonly compass = createCompassHeadingFilter();
  private lastHeading: number | null = null;
  private lastAccuracy = 15;
  private lastLat: number | null = null;
  private lastLng: number | null = null;
  private lastOrientationEmitAt = 0;
  private lastFixTimestamp = 0;

  protected onStart(_options?: PositionProviderStartOptions): void {
    if (!navigator.geolocation) {
      this.reportStatus('error');
      return;
    }
    const generation = this.generation;

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!this.running || generation !== this.generation) return;
        this.lastFixTimestamp = position.timestamp;
        this.lastAccuracy = position.coords.accuracy ?? this.lastAccuracy;
        this.lastLat = position.coords.latitude;
        this.lastLng = position.coords.longitude;
        const heading = this.resolveHeading(position.coords.heading);
        this.emit({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          ...(heading != null ? { heading } : {}),
          accuracy: this.lastAccuracy,
          timestamp: this.lastFixTimestamp,
        });
      },
      (error) => {
        if (!this.running || generation !== this.generation) return;
        this.lastLat = null;
        this.lastLng = null;
        this.reportStatus(error.code === 1 ? 'error' : 'inactive');
        // Surface why live tracking is silent (permission denied, timeout…).
        appWarn('GPS', 'watchPosition error', {
          code: error.code,
          message: error.message,
        });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );

    void this.attachOrientationListeners();
  }

  protected onStop(): void {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.detachOrientationListeners();
    this.compass.reset();
    this.lastHeading = null;
    this.lastLat = null;
    this.lastLng = null;
    this.lastFixTimestamp = 0;
    this.lastOrientationEmitAt = 0;
  }

  private async attachOrientationListeners(): Promise<void> {
    const generation = this.generation;
    const granted = await this.requestOrientationPermission();
    if (!granted || !this.running || generation !== this.generation) return;

    this.orientationHandler = (event: DeviceOrientationEvent) => {
      const heading = this.compass.ingest(
        event,
        performance.now(),
        readScreenOrientationDeg(
          window.screen?.orientation?.angle,
          typeof window.orientation === 'number' ? window.orientation : null,
        ),
      );
      if (heading == null) return;

      const prev = this.lastHeading;
      this.lastHeading = heading;

      // Re-emit while stationary so the 2D heading cone tracks phone turns.
      if (this.lastLat == null || this.lastLng == null) return;
      const now = performance.now();
      if (prev != null) {
        const delta = Math.abs(this.lastHeading - prev);
        const turned = Math.min(delta, 360 - delta);
        if (turned < 1.5 && now - this.lastOrientationEmitAt < 120) return;
      } else if (now - this.lastOrientationEmitAt < 120) {
        return;
      }
      this.lastOrientationEmitAt = now;

      this.emit({
        latitude: this.lastLat,
        longitude: this.lastLng,
        heading: this.lastHeading,
        accuracy: this.lastAccuracy,
        timestamp: this.lastFixTimestamp,
      });
    };

    window.addEventListener('deviceorientationabsolute', this.orientationHandler, true);
    window.addEventListener('deviceorientation', this.orientationHandler, true);
  }

  private detachOrientationListeners(): void {
    if (!this.orientationHandler) return;
    window.removeEventListener('deviceorientationabsolute', this.orientationHandler, true);
    window.removeEventListener('deviceorientation', this.orientationHandler, true);
    this.orientationHandler = null;
  }

  private async requestOrientationPermission(): Promise<boolean> {
    return requestDeviceOrientationPermission();
  }

  private resolveHeading(geoHeading: number | null): number | undefined {
    // Prefer compass for the direction glow; GPS course lags phone facing when turning.
    if (this.lastHeading != null && Number.isFinite(this.lastHeading)) {
      return this.lastHeading;
    }
    return headingFromGeolocationCourse(geoHeading);
  }
}

declare global {
  interface DeviceOrientationEvent {
    webkitCompassHeading?: number;
    webkitCompassAccuracy?: number;
    requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
  }
}

export async function requestDeviceOrientationPermission(): Promise<boolean> {
  if (typeof DeviceOrientationEvent === 'undefined') return false;

  const requestPermission = (
    DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
    }
  ).requestPermission;

  if (typeof requestPermission !== 'function') {
    return true;
  }

  try {
    const state = await requestPermission.call(DeviceOrientationEvent);
    return state === 'granted';
  } catch {
    return false;
  }
}
