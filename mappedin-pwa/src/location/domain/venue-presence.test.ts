import { describe, expect, it } from 'vitest';

import {
  arNotAtVenueCopy,
  myLocationNotAtVenueCopy,
  userVenuePresence,
  venuePresenceAnchor,
} from './venue-presence';

const origin = { latitude: 43.64, longitude: -79.38, accuracy: 8 };
const nearbyVenue = { latitude: 43.641, longitude: -79.381 };
const farVenue = { latitude: 34.01, longitude: -118.28 };

describe('userVenuePresence', () => {
  it('is at-venue when GPS is within the campus radius', () => {
    expect(userVenuePresence('granted', origin, nearbyVenue)).toBe('at-venue');
  });

  it('is away when GPS is well outside the venue', () => {
    expect(userVenuePresence('granted', origin, farVenue)).toBe('away');
  });

  it('treats a poor GPS fix as at-venue when accuracy covers the gap', () => {
    const justOutside = { latitude: 43.65, longitude: -79.38 };
    expect(userVenuePresence('granted', origin, justOutside)).toBe('away');
    const coarse = { ...origin, accuracy: 200 };
    expect(userVenuePresence('granted', coarse, justOutside)).toBe('at-venue');
  });

  it('is unknown without a live user origin or venue coordinates', () => {
    expect(userVenuePresence('denied', origin, nearbyVenue)).toBe('unknown');
    expect(userVenuePresence('granted', null, nearbyVenue)).toBe('unknown');
    expect(userVenuePresence('granted', origin, {})).toBe('unknown');
    expect(userVenuePresence('granted', origin, null)).toBe('unknown');
  });
});

describe('venuePresenceAnchor', () => {
  it('prefers catalog coordinates over a map fallback', () => {
    expect(venuePresenceAnchor(nearbyVenue, farVenue)).toEqual(nearbyVenue);
  });

  it('uses the map fallback when the catalog has no coordinates', () => {
    expect(venuePresenceAnchor({ latitude: null, longitude: null }, farVenue)).toEqual(
      farVenue,
    );
    expect(venuePresenceAnchor(undefined, nearbyVenue)).toEqual(nearbyVenue);
  });
});

describe('myLocationNotAtVenueCopy', () => {
  it('names the venue when one is known', () => {
    expect(myLocationNotAtVenueCopy('LTV-8')).toEqual({
      title: "You're not at the location",
      body: "You're not at LTV-8. My location is only available at the venue.",
    });
  });
});

describe('arNotAtVenueCopy', () => {
  it('names the venue when one is known', () => {
    expect(arNotAtVenueCopy('LA Stadium')).toEqual({
      title: "You're not at the location",
      body: "You're not at LA Stadium. Head there to try AR navigation.",
    });
  });

  it('falls back when the venue name is missing', () => {
    expect(arNotAtVenueCopy('  ')).toEqual({
      title: "You're not at the location",
      body: "You're not at this venue. Head there to try AR navigation.",
    });
  });
});
