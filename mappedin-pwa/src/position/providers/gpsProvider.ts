import { PositionProvider, type PositionProviderStartOptions } from '../positionProvider';
import type { FplacesPositionFrame } from '../types';

export class GpsPositionProvider extends PositionProvider {
  readonly source: FplacesPositionFrame['source'] = 'gps';

  private watchId: number | null = null;
  private orientationHandler: ((event: DeviceOrientationEvent) => void) | null = null;
  private lastHeading = 0;
  private lastAccuracy = 15;

  protected onStart(_options?: PositionProviderStartOptions): void {
    if (!navigator.geolocation) return;

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.lastAccuracy = position.coords.accuracy ?? this.lastAccuracy;
        this.emit({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          heading: this.resolveHeading(position.coords.heading),
          accuracy: this.lastAccuracy,
        });
      },
      () => undefined,
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
  }

  private async attachOrientationListeners(): Promise<void> {
    const granted = await this.requestOrientationPermission();
    if (!granted || !this.running) return;

    this.orientationHandler = (event: DeviceOrientationEvent) => {
      const alpha = event.webkitCompassHeading ?? event.alpha;
      if (alpha != null && Number.isFinite(alpha)) {
        this.lastHeading = event.webkitCompassHeading ?? (360 - alpha) % 360;
      }
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

  private resolveHeading(geoHeading: number | null): number {
    if (geoHeading != null && Number.isFinite(geoHeading) && geoHeading >= 0) {
      return geoHeading;
    }
    return this.lastHeading;
  }
}

declare global {
  interface DeviceOrientationEvent {
    webkitCompassHeading?: number;
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
