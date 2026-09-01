import {
  coordinatesFromPosition,
  isPermissionDeniedError,
  type GeolocationPermissionState,
  type UserCoordinates,
} from '../location/domain/geolocation-permission';

export type {
  GeolocationPermissionState,
  UserCoordinates,
} from '../location/domain/geolocation-permission';

export class LocationService {
  /** Query current geolocation permission without prompting (Permissions API). */
  async queryPermission(): Promise<GeolocationPermissionState> {
    if (!navigator.geolocation) return 'unsupported';
    if (!navigator.permissions?.query) return 'prompt';

    try {
      const status = await navigator.permissions.query({
        name: 'geolocation',
      });
      if (status.state === 'granted') return 'granted';
      if (status.state === 'denied') return 'denied';
      return 'prompt';
    } catch {
      // Safari and some browsers reject geolocation permission queries.
      return 'prompt';
    }
  }

  /**
   * True when the browser has permanently denied geolocation (settings required).
   * When denied, calling getCurrentPosition would not show a useful prompt.
   */
  async isPermanentlyDenied(): Promise<boolean> {
    return (await this.queryPermission()) === 'denied';
  }

  async getCurrentPosition(options?: {
    timeoutMs?: number;
  }): Promise<GeolocationPosition> {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported in this browser.');
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: options?.timeoutMs ?? 8000,
        maximumAge: 0,
      });
    });
  }

  /** Request permission (via position read) and return coordinates. */
  async requestLocation(options?: {
    timeoutMs?: number;
  }): Promise<UserCoordinates> {
    const position = await this.getCurrentPosition(options);
    return coordinatesFromPosition(position);
  }

  isPermissionDeniedError(error: unknown): boolean {
    return isPermissionDeniedError(error);
  }

  geolocationErrorMessage(error: GeolocationPositionError | Error): string {
    if (error instanceof Error && !('code' in error)) {
      return error.message || 'Could not get your location.';
    }

    const geoError = error as GeolocationPositionError;
    switch (geoError.code) {
      case geoError.PERMISSION_DENIED:
        return 'Location permission was denied. Allow location access and try again.';
      case geoError.POSITION_UNAVAILABLE:
        return 'Location is unavailable. Try again near a window or outdoors.';
      case geoError.TIMEOUT:
        return 'Location request timed out. Try again.';
      default:
        return 'Could not get your location.';
    }
  }
}
