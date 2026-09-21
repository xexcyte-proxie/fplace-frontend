import { describe, expect, it } from 'vitest';

import {
  canCreateVenuePost,
  postingNotAtVenueComposerHint,
  postingNotAtVenueCopy,
} from './venue-posting';

describe('canCreateVenuePost', () => {
  it('allows posting at the venue or when presence is unknown', () => {
    expect(canCreateVenuePost('at-venue')).toBe(true);
    expect(canCreateVenuePost('unknown')).toBe(true);
  });

  it('blocks posting when GPS shows the user is away', () => {
    expect(canCreateVenuePost('away')).toBe(false);
  });
});

describe('postingNotAtVenueCopy', () => {
  it('names the venue and keeps map and posts available', () => {
    expect(postingNotAtVenueCopy('Riverside')).toEqual({
      title: "You're not at the location",
      body: "You're not at Riverside. You can still browse the map and posts. Posting is only available when you're at the venue.",
    });
  });

  it('falls back when the venue name is missing', () => {
    expect(postingNotAtVenueCopy('')).toEqual({
      title: "You're not at the location",
      body: "You're not at this venue. You can still browse the map and posts. Posting is only available when you're at the location.",
    });
  });

  it('uses a short composer hint', () => {
    expect(postingNotAtVenueComposerHint()).toBe(
      'Posting is only available at this venue',
    );
  });
});
