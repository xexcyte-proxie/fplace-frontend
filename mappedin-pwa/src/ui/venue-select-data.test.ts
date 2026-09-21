import { describe, expect, it } from 'vitest';

import { venuesForPicker } from './venue-select-data';
import type { ForumVenueSummary } from '../types';

const venues: ForumVenueSummary[] = [
  {
    id: 2,
    name: 'Far Arena',
    location: 'Toronto',
    latitude: 43.7,
    longitude: -79.4,
  },
  {
    id: 1,
    name: 'Near Stadium',
    location: 'Downtown',
    latitude: 43.641,
    longitude: -79.381,
  },
  { id: 3, name: 'Unknown Park', location: 'Mystery' },
];

const user = { latitude: 43.64, longitude: -79.38, accuracy: 5 };

describe('venuesForPicker', () => {
  it('keeps catalog order and omits distance when location is denied', () => {
    const options = venuesForPicker(venues, '', 'denied', user);
    expect(options.map((item) => item.id)).toEqual(['2', '1', '3']);
    expect(options[0]?.subtitle).toBe('Toronto');
  });

  it('sorts by live distance and labels granted results', () => {
    const options = venuesForPicker(venues, '', 'granted', user);
    expect(options.map((item) => item.id)).toEqual(['1', '2', '3']);
    expect(options[0]?.subtitle).toMatch(/^[\d.]+ (m|km) · Downtown$/);
    expect(options[2]?.subtitle).toBe('Mystery');
  });

  it('filters by name when searching', () => {
    const options = venuesForPicker(venues, 'stadium', 'denied', user);
    expect(options.map((item) => item.id)).toEqual(['1']);
  });
});
