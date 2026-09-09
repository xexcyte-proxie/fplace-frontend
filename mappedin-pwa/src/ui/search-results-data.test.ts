import { describe, expect, it } from 'vitest';

import { buildSearchResultViews } from './search-results-data';
import type { LocationResult } from '../types';

const results: LocationResult[] = [
  {
    id: 'far',
    name: 'North Gate',
    floorName: 'Level 2',
    latitude: 43.642,
    longitude: -79.382,
  },
  {
    id: 'near',
    name: 'Coffee',
    floorName: 'Level 1',
    latitude: 43.6402,
    longitude: -79.3802,
  },
  { id: 'unknown', name: 'Lost & Found' },
];

const user = { latitude: 43.64, longitude: -79.38, accuracy: 6 };

describe('buildSearchResultViews', () => {
  it('hides distance and keeps search order when location is not granted', () => {
    const views = buildSearchResultViews(results, 'denied', user);
    expect(views.map((item) => item.id)).toEqual(['far', 'near', 'unknown']);
    expect(views.every((item) => item.distanceLabel == null)).toBe(true);
  });

  it('labels and sorts by live distance when location is granted', () => {
    const views = buildSearchResultViews(results, 'granted', user);
    expect(views.map((item) => item.id)).toEqual(['near', 'far', 'unknown']);
    expect(views[0]?.distanceLabel).toMatch(/m$/);
    expect(views[2]?.distanceLabel).toBeNull();
  });
});
