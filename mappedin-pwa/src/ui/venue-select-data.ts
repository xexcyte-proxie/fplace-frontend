import type {
  ForumSectionSummary,
  ForumVenueSummary,
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

export function venueToOption(venue: ForumVenueSummary): VenueOption {
  return {
    id: String(venue.id),
    name: venue.name,
    subtitle: venue.location?.trim() || 'Stadium venue',
  };
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

export function filterVenues(
  venues: VenueOption[],
  query: string,
): VenueOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return venues;
  return venues.filter(
    (venue) =>
      venue.name.toLowerCase().includes(normalized) ||
      venue.subtitle.toLowerCase().includes(normalized),
  );
}
