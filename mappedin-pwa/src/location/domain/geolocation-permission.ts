/** Browser geolocation permission as used by the startup gate. */
export type GeolocationPermissionState =
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
    typeof (error as GeolocationPositionError).code === 'number' &&
    typeof (error as GeolocationPositionError).PERMISSION_DENIED === 'number'
  );
}

export function isPermissionDeniedError(error: unknown): boolean {
  if (!isGeolocationPositionError(error)) return false;
  return error.code === error.PERMISSION_DENIED;
}
