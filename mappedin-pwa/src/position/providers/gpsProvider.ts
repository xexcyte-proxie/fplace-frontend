import { navigationDiagnostics as navDiag } from '../debug/navigation-diagnostics';
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
  private diagnosticPreviousRaw: { latitude: number; longitude: number; timestamp: number } | null = null;

  protected onStart(_options?: PositionProviderStartOptions): void {
    if (!navigator.geolocation) {
      this.reportStatus('error');
      return;
    }
    const generation = this.generation;

    navDiag?.record('subscription', 'GpsPositionProvider.onStart', { action: 'start', generation, enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    navDiag?.update('gps-environment', 'GpsPositionProvider.onStart', { secureContext: globalThis.isSecureContext ?? null, geolocationAvailable: !!navigator.geolocation, userAgent: navigator.userAgent, platform: navigator.platform, orientationAvailable: typeof DeviceOrientationEvent !== 'undefined' });
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!this.running || generation !== this.generation) return;
        const previous = this.diagnosticPreviousRaw;
        const raw = { latitude: position.coords.latitude, longitude: position.coords.longitude, timestamp: position.timestamp };
        const diagnosticCause = navDiag?.update('raw-gps', 'GpsPositionProvider.watchPosition', { raw, accuracy: position.coords.accuracy,
          speed: position.coords.speed, heading: position.coords.heading, timestamp: position.timestamp,
          ageMs: Date.now()-position.timestamp, previousRaw: previous,
          elapsedFixMs: previous ? position.timestamp - previous.timestamp : null,
          impliedSpeedMps: previous && position.timestamp > previous.timestamp ? navDiag!.distance(raw, previous)! / ((position.timestamp - previous.timestamp)/1000) : null, distanceFromPreviousM: previous ? Math.hypot((raw.latitude-previous.latitude)*111195, (raw.longitude-previous.longitude)*111195*Math.cos(raw.latitude*Math.PI/180)) : null, generation });
        if (navDiag) this.diagnosticPreviousRaw = raw;
        this.lastFixTimestamp = position.timestamp;
        this.lastAccuracy = position.coords.accuracy ?? this.lastAccuracy;
        this.lastLat = position.coords.latitude;
        this.lastLng = position.coords.longitude;
        const heading = this.resolveHeading(position.coords.heading);
        const previousCause = navDiag?.cause ?? null;
        if (navDiag) navDiag.cause = diagnosticCause ?? null;
        try { this.emit({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          ...(heading != null ? { heading } : {}),
          accuracy: this.lastAccuracy,
          timestamp: this.lastFixTimestamp,
        }); } finally { if (navDiag) navDiag.cause = previousCause; }
      },
      (error) => {
        if (!this.running || generation !== this.generation) return;
        // Keep the last sample for heading-only turns. Its original timestamp
        // remains unchanged, so this cannot fabricate a fresh physical fix.
        navDiag?.record('error', 'GpsPositionProvider.watchPosition', { reason: error.code === 1 ? 'permission-denied' : error.code === 3 ? 'timeout' : 'position-unavailable', code: error.code, message: error.message, subscriptionRunning: this.running, generation });
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
      navDiag?.record('subscription', 'GpsPositionProvider.onStop', { action: 'stop', generation: this.generation });
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
      navDiag?.record('heading-only', 'GpsPositionProvider.orientation', { heading: this.lastHeading, timestamp: this.lastFixTimestamp });

      this.emit({
        headingOnly: true,
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
    return requestDeviceOrientationPermission('GpsPositionProvider');
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

export async function requestDeviceOrientationPermission(source = 'orientation'): Promise<boolean> {
  if (typeof DeviceOrientationEvent === 'undefined') {
    navDiag?.update('compass-permission', source, { permission: 'unsupported', reason: 'orientation-api-unavailable' });
    return false;
  }

  const requestPermission = (
    DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
    }
  ).requestPermission;

  if (typeof requestPermission !== 'function') {
    navDiag?.update('compass-permission', source, { permission: 'not-required', reason: 'browser-has-no-explicit-orientation-permission-api' });
    return true;
  }

  navDiag?.record('compass-permission-attempt', source, { reason: 'direct-orientation-permission-request', userActivation: typeof navigator === 'undefined' ? null : navigator.userActivation?.isActive ?? null });
  try {
    const state = await requestPermission.call(DeviceOrientationEvent);
    navDiag?.update('compass-permission', source, { permission: state, reason: 'browser-permission-result' });
    return state === 'granted';
  } catch (error) {
    navDiag?.update('compass-permission', source, { permission: 'denied-or-gesture-required', reason: 'browser-permission-threw', severity: 'error', error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
