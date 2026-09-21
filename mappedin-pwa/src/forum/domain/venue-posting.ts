import type { VenuePresence } from '../../location/domain/venue-presence';

/**
 * Viewing the map and feed is allowed remotely. Creating a post is not:
 * off-site posts make the live crowd feed misleading.
 */
export function canCreateVenuePost(presence: VenuePresence): boolean {
  return presence !== 'away';
}

export function postingNotAtVenueCopy(venueName?: string | null): {
  title: string;
  body: string;
} {
  const name = venueName?.trim();
  return {
    title: "You're not at the location",
    body: name
      ? `You're not at ${name}. You can still browse the map and posts. Posting is only available when you're at the venue.`
      : "You're not at this venue. You can still browse the map and posts. Posting is only available when you're at the location.",
  };
}

export function postingNotAtVenueComposerHint(): string {
  return 'Posting is only available at this venue';
}
