/**
 * Tracks which venues this browser has already entered so we can show the
 * first-time-at-venue home vs returning home.
 */
export interface VenueVisitRepository {
  hasVisited(venueId: string): boolean;
  markVisited(venueId: string): void;
  listVisited(): string[];
  clear(): void;
}
