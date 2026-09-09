import type { PermissionChoice } from '../../permissions/domain/permission-choice';
import { haversineMeters } from '../../utils/geo-math';
import type { UserCoordinates } from './geolocation-permission';

/** Ignore tiny GPS jitter when publishing a new live user origin. */
export const USER_LOCATION_MOVE_THRESHOLD_M = 3;

/** Floor for how often a standing user origin is republished. */
export const USER_LOCATION_PUBLISH_INTERVAL_MS = 1500;

export function parseCoordinateNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function canUseLiveUserOrigin(
  permission: PermissionChoice,
  coords: UserCoordinates | null | undefined,
): coords is UserCoordinates {
  return (
    permission === 'granted' &&
    coords != null &&
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude)
  );
}

export function metersFromUser(
  permission: PermissionChoice,
  from: UserCoordinates | null | undefined,
  to: { latitude?: number | null; longitude?: number | null } | null | undefined,
): number | null {
  if (!canUseLiveUserOrigin(permission, from)) return null;
  const latitude = to?.latitude;
  const longitude = to?.longitude;
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  return haversineMeters(from, { latitude, longitude });
}

export function formatRelativeDistance(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function sortByUserDistance<T>(
  items: readonly T[],
  distanceOf: (item: T) => number | null,
): T[] {
  return [...items].sort((a, b) => {
    const da = distanceOf(a);
    const db = distanceOf(b);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });
}

export function shouldPublishUserLocation(
  previous: UserCoordinates | null | undefined,
  next: UserCoordinates,
  elapsedMs: number,
  nowThresholdMs = USER_LOCATION_PUBLISH_INTERVAL_MS,
  moveThresholdM = USER_LOCATION_MOVE_THRESHOLD_M,
): boolean {
  if (!previous) return true;
  if (elapsedMs >= nowThresholdMs) return true;
  return haversineMeters(previous, next) >= moveThresholdM;
}
