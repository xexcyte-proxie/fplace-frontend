import { describe, expect, it } from 'vitest';

import {
  buildSectionLocationIndex,
  conversationLocationIdForSection,
  conversationLocationIdsForSections,
  forumPostMatchesLocation,
  sectionIdForLocation,
  sectionIdForMapLocation,
  sectionMatchesConversationLocation,
  slugifyLocationName,
} from './section-locations';

const sections = [
  { id: 3, name: 'Church', code: 'CH', mappedinLocationId: 'loc-church' },
  { id: 7, name: 'LTV Compound', code: '', mappedinLocationId: 'loc-ltv' },
  { id: 9, name: 'Canteen', code: 'CAN-1', mappedinLocationId: null },
];

describe('slugifyLocationName', () => {
  it('lowercases and collapses non-alphanumerics into dashes', () => {
    expect(slugifyLocationName('LTV Compound')).toBe('ltv-compound');
    expect(slugifyLocationName('  Gate A / North ')).toBe('gate-a-north');
  });
});

describe('sectionIdForLocation', () => {
  it('resolves a Mappedin location id to the matching section id', () => {
    expect(sectionIdForLocation(sections, 'loc-church')).toBe(3);
    expect(sectionIdForLocation(sections, 'loc-ltv')).toBe(7);
  });

  it('resolves raw forum section id strings', () => {
    expect(sectionIdForLocation(sections, '9')).toBe(9);
    expect(sectionIdForLocation(sections, '3')).toBe(3);
  });

  it('does not match on section name or code slugs', () => {
    expect(sectionIdForLocation(sections, 'church')).toBeNull();
    expect(sectionIdForLocation(sections, 'ch')).toBeNull();
    expect(sectionIdForLocation(sections, 'LTV Compound')).toBeNull();
    expect(sectionIdForLocation(sections, 'can-1')).toBeNull();
  });

  it('returns null for unknown or empty locations', () => {
    expect(sectionIdForLocation(sections, 'car-park')).toBeNull();
    expect(sectionIdForLocation(sections, null)).toBeNull();
    expect(sectionIdForLocation(sections, '')).toBeNull();
  });
});

describe('sectionIdForMapLocation', () => {
  it('matches the Mappedin location id and ignores the visible name', () => {
    expect(sectionIdForMapLocation(sections, 'loc-church', 'Church')).toBe(3);
    expect(
      sectionIdForMapLocation(sections, 'mappedin-xyz', 'Church'),
    ).toBeNull();
    expect(sectionIdForMapLocation(sections, 'car-park', 'Car Park')).toBeNull();
  });
});

describe('forumPostMatchesLocation', () => {
  it('accepts every post on the venue-wide feed', () => {
    expect(forumPostMatchesLocation(3, null, sections)).toBe(true);
    expect(forumPostMatchesLocation(null, null, sections)).toBe(true);
  });

  it('accepts only posts tagged with the tapped section', () => {
    expect(forumPostMatchesLocation(3, 'loc-church', sections)).toBe(true);
    expect(forumPostMatchesLocation(7, 'loc-church', sections)).toBe(false);
    expect(forumPostMatchesLocation(null, 'loc-church', sections)).toBe(false);
  });

  it('rejects every post when the location has no section', () => {
    expect(forumPostMatchesLocation(3, 'car-park', sections)).toBe(false);
  });
});

describe('conversationLocationIdForSection', () => {
  it('prefers the Mappedin location id and falls back to the forum id', () => {
    expect(conversationLocationIdForSection(sections[0]!)).toBe('loc-church');
    expect(conversationLocationIdForSection(sections[2]!)).toBe('9');
  });
});

describe('conversationLocationIdsForSections', () => {
  it('lists unique location ids for active sections', () => {
    expect(conversationLocationIdsForSections(sections)).toEqual([
      'loc-church',
      'loc-ltv',
      '9',
    ]);
    expect(
      conversationLocationIdsForSections([
        ...sections,
        { ...sections[0]!, is_active: false },
        { id: 3, name: 'Church duplicate', mappedinLocationId: 'loc-church' },
      ]),
    ).toEqual(['loc-church', 'loc-ltv', '9']);
  });
});

describe('sectionMatchesConversationLocation', () => {
  it('matches Mappedin ids and raw forum section ids', () => {
    expect(sectionMatchesConversationLocation(sections[0]!, 'loc-church')).toBe(
      true,
    );
    expect(sectionMatchesConversationLocation(sections[0]!, '3')).toBe(true);
    expect(sectionMatchesConversationLocation(sections[0]!, 'loc-ltv')).toBe(
      false,
    );
  });
});

describe('buildSectionLocationIndex', () => {
  it('indexes each section by forum id and Mappedin location id', () => {
    const index = buildSectionLocationIndex(sections);
    expect(index.get('3')).toBe(3);
    expect(index.get('loc-church')).toBe(3);
    expect(index.get('church')).toBeUndefined();
    expect(index.get('ch')).toBeUndefined();
    expect(index.get('loc-ltv')).toBe(7);
  });
});
