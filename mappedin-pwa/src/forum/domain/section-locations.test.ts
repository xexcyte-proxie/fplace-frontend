import { describe, expect, it } from 'vitest';

import {
  buildSectionLocationIndex,
  forumPostMatchesLocation,
  sectionIdForLocation,
  slugifyLocationName,
} from './section-locations';

const sections = [
  { id: 3, name: 'Church', code: 'CH' },
  { id: 7, name: 'LTV Compound', code: '' },
  { id: 9, name: 'Canteen', code: 'CAN-1' },
];

describe('slugifyLocationName', () => {
  it('lowercases and collapses non-alphanumerics into dashes', () => {
    expect(slugifyLocationName('LTV Compound')).toBe('ltv-compound');
    expect(slugifyLocationName('  Gate A / North ')).toBe('gate-a-north');
  });
});

describe('sectionIdForLocation', () => {
  it('resolves a map location slug to the matching section id', () => {
    expect(sectionIdForLocation(sections, 'church')).toBe(3);
    expect(sectionIdForLocation(sections, 'ltv-compound')).toBe(7);
  });

  it('resolves raw section id strings and code slugs', () => {
    expect(sectionIdForLocation(sections, '9')).toBe(9);
    expect(sectionIdForLocation(sections, 'ch')).toBe(3);
    expect(sectionIdForLocation(sections, 'can-1')).toBe(9);
  });

  it('slugifies unnormalized input before matching', () => {
    expect(sectionIdForLocation(sections, 'LTV Compound')).toBe(7);
  });

  it('returns null for unknown or empty locations', () => {
    expect(sectionIdForLocation(sections, 'car-park')).toBeNull();
    expect(sectionIdForLocation(sections, null)).toBeNull();
    expect(sectionIdForLocation(sections, '')).toBeNull();
  });
});

describe('forumPostMatchesLocation', () => {
  it('accepts every post on the venue-wide feed', () => {
    expect(forumPostMatchesLocation(3, null, sections)).toBe(true);
    expect(forumPostMatchesLocation(null, null, sections)).toBe(true);
  });

  it('accepts only posts tagged with the tapped section', () => {
    expect(forumPostMatchesLocation(3, 'church', sections)).toBe(true);
    expect(forumPostMatchesLocation(7, 'church', sections)).toBe(false);
    expect(forumPostMatchesLocation(null, 'church', sections)).toBe(false);
  });

  it('rejects every post when the location has no section', () => {
    expect(forumPostMatchesLocation(3, 'car-park', sections)).toBe(false);
  });
});

describe('buildSectionLocationIndex', () => {
  it('indexes each section by id, name slug, and code slug', () => {
    const index = buildSectionLocationIndex(sections);
    expect(index.get('3')).toBe(3);
    expect(index.get('church')).toBe(3);
    expect(index.get('ch')).toBe(3);
    expect(index.get('ltv-compound')).toBe(7);
  });
});
