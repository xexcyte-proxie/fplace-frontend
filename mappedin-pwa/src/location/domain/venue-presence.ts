import type { PermissionChoice } from '../../permissions/domain/permission-choice';
import type { UserCoordinates } from './geolocation-permission';
import { metersFromUser } from './user-relative-distance';

export type VenuePresence = 'at-venue' | 'away' | 'unknown';

/**
 * Campus-sized radius around a venue pin. Large stadiums are a few hundred
 * meters across; GPS accuracy is added on top at call time.
 */
export const VENUE_PRESENCE_RADIUS_M = 1000;

type GeoPoint = { latitude?: number | null; longitude?: number | null };

export function remoteArEnabled(): boolean {
  return import.meta.env.VITE_ALLOW_REMOTE_AR === '1';
}

function hasFiniteCoordinates(
  point: GeoPoint | null | undefined,
): point is { latitude: number; longitude: number } {
  return (
    point != null &&
    point.latitude != null &&
    point.longitude != null &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude)
  );
}

/**
 * Catalog lat/lng when present; otherwise a map geometry fallback.
 */
export function venuePresenceAnchor(
  venue: GeoPoint | null | undefined,
  mapFallback: GeoPoint | null | undefined = null,
): GeoPoint | null {
  if (hasFiniteCoordinates(venue)) return venue;
  if (hasFiniteCoordinates(mapFallback)) return mapFallback;
  return venue ?? mapFallback ?? null;
}

export function userVenuePresence(
  permission: PermissionChoice,
  userLocation: UserCoordinates | null | undefined,
  venue: GeoPoint | null | undefined,
): VenuePresence {
  if (!venue) return 'unknown';
  const meters = metersFromUser(permission, userLocation, venue);
  if (meters == null) return 'unknown';
  const accuracy =
    userLocation?.accuracy != null && Number.isFinite(userLocation.accuracy)
      ? Math.max(0, userLocation.accuracy)
      : 0;
  return meters <= VENUE_PRESENCE_RADIUS_M + accuracy ? 'at-venue' : 'away';
}

export function arNotAtVenueCopy(venueName?: string | null): {
  title: string;
  body: string;
} {
  const name = venueName?.trim();
  return {
    title: "You're not at the location",
    body: name
      ? `You're not at ${name}. Head there to try AR navigation.`
      : "You're not at this venue. Head there to try AR navigation.",
  };
}

/** Label / toast when ⊕ is unavailable off-site. */
export function myLocationNotAtVenueCopy(venueName?: string | null): {
  title: string;
  body: string;
} {
  const name = venueName?.trim();
  return {
    title: "You're not at the location",
    body: name
      ? `You're not at ${name}. My location is only available at the venue.`
      : "You're not at this venue. My location is only available at the location.",
  };
}
