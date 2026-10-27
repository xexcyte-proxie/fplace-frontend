import { recordLocationDiagnostic, locationErrorDetail } from '../location/domain/location-diagnostics';
import {
  coordinatesFromPosition,
  isPermissionDeniedError,
  type GeolocationPermissionState,
  type UserCoordinates,
} from '../location/domain/geolocation-permission';
import { appLog, appWarn } from '../utils/logger';

export type {
  GeolocationPermissionState,
  UserCoordinates,
} from '../location/domain/geolocation-permission';

export class LocationService {
  /** Query current geolocation permission without prompting (Permissions API). */
  async queryPermission(): Promise<GeolocationPermissionState> {
    if (!navigator.geolocation) {
      appLog('LocationService', 'queryPermission: geolocation unsupported');
      recordLocationDiagnostic('permission', { state: 'unsupported' });
      return 'unsupported';
    }
    if (!navigator.permissions?.query) {
      appLog('LocationService', 'queryPermission: Permissions API unavailable; assuming prompt');
      recordLocationDiagnostic('permission', { state: 'unknown', reason: 'Permissions API unavailable' });
      return 'prompt';
    }

    try {
      const status = await navigator.permissions.query({
        name: 'geolocation',
      });
      recordLocationDiagnostic('permission', { state: status.state });
      appLog('LocationService', 'queryPermission result', {
        state: status.state,
      });
      if (status.state === 'granted') return 'granted';
      if (status.state === 'denied') return 'denied';
      return 'prompt';
    } catch (error) {
      recordLocationDiagnostic('permission-query-failed', locationErrorDetail(error));
      // Safari and some browsers reject geolocation permission queries.
      appWarn('LocationService', 'queryPermission failed; assuming prompt', error);
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
    enableHighAccuracy?: boolean;
    maximumAgeMs?: number;
  }): Promise<GeolocationPosition> {
    if (!navigator.geolocation) {
      appWarn('LocationService', 'getCurrentPosition: geolocation unsupported');
      throw new Error('Geolocation is not supported in this browser.');
    }

    const requestOptions = {
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      timeout: options?.timeoutMs ?? 8000,
      maximumAge: options?.maximumAgeMs ?? 0,
    };
    const started = Date.now();
    recordLocationDiagnostic('position-request', {
      ...requestOptions,
      userActivationActive: navigator.userActivation?.isActive ?? 'unknown',
    });
    appLog('LocationService', 'getCurrentPosition requesting', requestOptions);

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          appLog('LocationService', 'getCurrentPosition success', {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
          recordLocationDiagnostic('position-success', { elapsedMs: Date.now() - started, accuracyMeters: position.coords.accuracy });
          resolve(position);
        },
        (error) => {
          appWarn('LocationService', 'getCurrentPosition error', {
            code: error.code,
            message: error.message,
          });
          recordLocationDiagnostic('position-failed', { ...locationErrorDetail(error), elapsedMs: Date.now() - started });
          reject(error);
        },
        requestOptions,
      );
    });
  }

  /** Request permission (via position read) and return coordinates. */
  async requestLocation(options?: {
    timeoutMs?: number;
  }): Promise<UserCoordinates> {
    appLog('LocationService', 'requestLocation start', options);
    let position: GeolocationPosition;
    try {
      position = await this.getCurrentPosition(options);
    } catch (error) {
      if (!isTimeoutError(error)) throw error;
      recordLocationDiagnostic('retry-relaxed-accuracy', { reason: 'High-accuracy request timed out' });
      appWarn(
        'LocationService',
        'high-accuracy position timed out; retrying with relaxed options',
      );
      position = await this.getCurrentPosition({
        timeoutMs: Math.max(options?.timeoutMs ?? 0, 15_000),
        enableHighAccuracy: false,
        maximumAgeMs: 60_000,
      });
    }
    const coords = coordinatesFromPosition(position);
    appLog('LocationService', 'requestLocation resolved', coords);
    return coords;
  }

  /**
   * Stream live GPS fixes while location is granted. Returns an unsubscribe.
   */
  watchLocation(
    onUpdate: (coords: UserCoordinates) => void,
    onError?: (error: unknown) => void,
    options?: { timeoutMs?: number },
  ): () => void {
    if (!navigator.geolocation) {
      onError?.(new Error('Geolocation is not supported in this browser.'));
      return () => {};
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => onUpdate(coordinatesFromPosition(position)),
      (error) => onError?.(error),
      {
        enableHighAccuracy: true,
        timeout: options?.timeoutMs ?? 15_000,
        maximumAge: 1_000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
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

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as GeolocationPositionError).code === 'number' &&
    typeof (error as GeolocationPositionError).TIMEOUT === 'number' &&
    (error as GeolocationPositionError).code ===
      (error as GeolocationPositionError).TIMEOUT
  );
}
