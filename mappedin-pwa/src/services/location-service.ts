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
  private pendingLocation: Promise<UserCoordinates> | null = null;
  /** Event-driven enhancement; returns a cleanup for listeners and pending setup. */
  observePermissionChanges(
    onChange: (state?: GeolocationPermissionState, resumed?: boolean) => void,
  ): () => void {
    let disposed = false;
    let status: PermissionStatus | null = null;
    let removeStatusListener: (() => void) | undefined;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    let leftApp = false;
    const changed = () => {
      if (!disposed && status) onChange(status.state);
    };
    const left = () => { leftApp = true; };
    const resume = () => {
      if (document.visibilityState === 'hidden' || resumeTimer !== undefined) return;
      // Coalesce focus/pageshow/visibility/resume bursts; never poll.
      resumeTimer = setTimeout(() => {
        resumeTimer = undefined;
        const resumed = leftApp;
        leftApp = false;
        if (!disposed) onChange(undefined, resumed);
      }, 100);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') left();
      else resume();
    };
    window.addEventListener('blur', left);
    window.addEventListener('pagehide', left);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('resume', resume);
    if (navigator.permissions?.query) {
      void navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (disposed) return;
        status = result;
        if (typeof status.addEventListener === 'function') {
          status.addEventListener('change', changed);
          removeStatusListener = () => status?.removeEventListener('change', changed);
        } else {
          status.onchange = changed;
          removeStatusListener = () => { if (status) status.onchange = null; };
        }
        changed();
      }).catch(() => { if (!disposed) onChange(); });
    }
    else onChange();
    return () => {
      disposed = true;
      clearTimeout(resumeTimer);
      removeStatusListener?.();
      window.removeEventListener('blur', left);
      window.removeEventListener('pagehide', left);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('resume', resume);
    };
  }

  /** Query current geolocation permission without prompting (Permissions API). */
  async queryPermission(): Promise<GeolocationPermissionState> {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      return 'unsupported';
    }
    if (!navigator.geolocation) {
      appLog('LocationService', 'queryPermission: geolocation unsupported');
      recordLocationDiagnostic('permission', { state: 'unsupported' });
      return 'unsupported';
    }
    if (!navigator.permissions?.query) {
      appLog('LocationService', 'queryPermission: Permissions API unavailable; state unknown');
      recordLocationDiagnostic('permission', { state: 'unknown', reason: 'Permissions API unavailable' });
      return 'unknown';
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
      return status.state === 'prompt' ? 'prompt' : 'unknown';
    } catch (error) {
      recordLocationDiagnostic('permission-query-failed', locationErrorDetail(error));
      // Safari and some browsers reject geolocation permission queries.
      appWarn('LocationService', 'queryPermission failed; state unknown', error);
      return 'unknown';
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
      timeout: options?.timeoutMs ?? 15_000,
      maximumAge: options?.maximumAgeMs ?? 10_000,
    };
    const started = Date.now();
    recordLocationDiagnostic('position-request', {
      ...requestOptions,
      userActivationActive: navigator.userActivation?.isActive ?? 'unknown',
    });
    appLog('LocationService', 'getCurrentPosition requesting', requestOptions);

    return new Promise((resolve, reject) => {
      let settled = false;
      const deadline = setTimeout(() => {
        if (settled) return;
        settled = true;
        recordLocationDiagnostic('position-deadline', { category: 'timeout' });
        reject({ code: 3, message: 'Location request timed out.', requestDeadline: true });
      }, requestOptions.timeout + 1000);
      try {
        navigator.geolocation.getCurrentPosition(
        (position) => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          appLog('LocationService', 'getCurrentPosition success', {
            accuracy: position.coords.accuracy,
          });
          recordLocationDiagnostic('position-success', { elapsedMs: Date.now() - started, accuracyMeters: position.coords.accuracy });
          resolve(position);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          appWarn('LocationService', 'getCurrentPosition error', {
            code: error.code,
            message: error.message,
          });
          recordLocationDiagnostic('position-failed', { ...locationErrorDetail(error), elapsedMs: Date.now() - started });
          reject(error);
        },
        requestOptions,
        );
      } catch (error) {
        settled = true;
        clearTimeout(deadline);
        reject(error);
      }
    });
  }

  /** Share simultaneous acquisition attempts without caching settled results. */
  requestLocation(options?: { timeoutMs?: number; maximumAgeMs?: number }): Promise<UserCoordinates> {
    if (this.pendingLocation) return this.pendingLocation;
    const pending = this.readLocation(options).finally(() => {
      if (this.pendingLocation === pending) this.pendingLocation = null;
    });
    this.pendingLocation = pending;
    return pending;
  }

  private async readLocation(options?: {
    timeoutMs?: number;
    maximumAgeMs?: number;
  }): Promise<UserCoordinates> {
    appLog('LocationService', 'requestLocation start', options);
    let position: GeolocationPosition;
    try {
      position = await this.getCurrentPosition(options);
    } catch (error) {
      if (!isRecoverablePositionError(error)) throw error;
      recordLocationDiagnostic('retry-relaxed-accuracy', { reason: 'High-accuracy position temporarily unavailable', ...locationErrorDetail(error) });
      appWarn(
        'LocationService',
        'high-accuracy position unavailable; retrying with relaxed options',
      );
      position = await this.getCurrentPosition({
        timeoutMs: Math.max(options?.timeoutMs ?? 0, 15_000),
        enableHighAccuracy: false,
        maximumAgeMs: options?.maximumAgeMs ?? 60_000,
      });
    }
    const coords = coordinatesFromPosition(position);
    appLog('LocationService', 'requestLocation resolved', { accuracyMeters: coords.accuracy });
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
      case 1:
        return 'fplaces can’t access your current location. Check device location services and browser access.';
      case 2:
        return 'Your device could not provide a location. Check device location services and browser access, then try near a window or outdoors.';
      case 3:
        return 'Location request timed out. Try again.';
      default:
        return 'Could not get your location.';
    }
  }
}

function isRecoverablePositionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  // Use standard numeric codes: native errors and browser wrappers may omit constants.
  // A native prompt may still be open at our deadline. Do not start another
  // request automatically in that case; only native provider errors fall back.
  if ('requestDeadline' in error) return false;
  const code = (error as GeolocationPositionError).code;
  return code === 2 || code === 3;
}
