import {
  formatRelativeDistance,
  metersFromUser,
  sortByUserDistance,
} from '../location/domain/user-relative-distance';
import type { PermissionChoice } from '../permissions/domain/permission-choice';
import type {
  ForumSectionSummary,
  ForumVenueSummary,
  UserLocationCoords,
} from '../types';

/** Venue option for the onboarding picker. */
export interface VenueOption {
  id: string;
  name: string;
  subtitle: string;
}

/** Section option shown after a venue is selected (replaces demo "gates"). */
export interface SectionOption {
  id: string;
  letter: string;
  name: string;
  subtitle: string;
}

export function venueToOption(
  venue: ForumVenueSummary,
  distanceLabel: string | null = null,
): VenueOption {
  const place = venue.location?.trim() || 'Stadium venue';
  return {
    id: String(venue.id),
    name: venue.name,
    subtitle: distanceLabel ? `${distanceLabel} · ${place}` : place,
  };
}

export function venuesForPicker(
  venues: readonly ForumVenueSummary[],
  query: string,
  permission: PermissionChoice,
  userLocation: UserLocationCoords | null,
): VenueOption[] {
  const matched = filterVenuesByQuery(venues, query);
  const decorated = matched.map((venue) => {
    const meters = metersFromUser(permission, userLocation, venue);
    return {
      venue,
      meters,
      distanceLabel: formatRelativeDistance(meters),
    };
  });
  const ranked = decorated.some((item) => item.meters != null)
    ? sortByUserDistance(decorated, (item) => item.meters)
    : decorated;
  return ranked.map(({ venue, distanceLabel }) =>
    venueToOption(venue, distanceLabel),
  );
}

function filterVenuesByQuery(
  venues: readonly ForumVenueSummary[],
  query: string,
): ForumVenueSummary[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...venues];
  return venues.filter(
    (venue) =>
      venue.name.toLowerCase().includes(normalized) ||
      (venue.location ?? '').toLowerCase().includes(normalized),
  );
}

export function sectionToOption(section: ForumSectionSummary): SectionOption {
  const code = section.code?.trim();
  const letter = (code || section.name).trim().charAt(0).toUpperCase() || 'S';
  return {
    id: String(section.id),
    letter,
    name: section.name,
    subtitle: code ? `Code ${code}` : 'Venue section',
  };
}

export function defaultSectionId(sections: ForumSectionSummary[]): string {
  return sections[0] ? String(sections[0].id) : '';
}
