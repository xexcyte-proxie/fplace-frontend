/** Browser geolocation permission as used by the startup gate. */
export type GeolocationPermissionState =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported';

export interface UserCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export function coordinatesFromPosition(
  position: GeolocationPosition,
): UserCoordinates {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy:
      typeof position.coords.accuracy === 'number'
        ? position.coords.accuracy
        : null,
  };
}

export function isGeolocationPermissionDenied(
  state: GeolocationPermissionState,
): boolean {
  return state === 'denied';
}

export function isGeolocationPositionError(
  error: unknown,
): error is GeolocationPositionError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as GeolocationPositionError).code === 'number'
  );
}

export function isPermissionDeniedError(error: unknown): boolean {
  if (!isGeolocationPositionError(error)) return false;
  return error.code === 1;
}

/** OS master location state is not exposed by standard web geolocation. */
export type LocationFailureKind = 'denied' | 'restricted' | 'unavailable' | 'timeout' | 'unsupported';
export function classifyLocationFailure(error: unknown, permission: GeolocationPermissionState): LocationFailureKind {
  if (permission === 'unsupported') return 'unsupported';
  if (permission === 'denied') return 'denied';
  if (!isGeolocationPositionError(error)) return 'restricted';
  if (error.code === 3) return 'timeout';
  if (error.code === 2) return permission === 'granted' ? 'unavailable' : 'restricted';
  return 'restricted';
}
