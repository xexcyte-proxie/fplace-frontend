import { describe, expect, it } from 'vitest';

import { partitionHomeVenues } from './home-venues';

const venues = [
  { id: 2, name: 'Arena' },
  { id: 1, name: 'Stadium' },
  { id: 3, name: 'LTV 8' },
];

describe('partitionHomeVenues', () => {
  it('lists visited venues newest-first and keeps the rest as other venues', () => {
    const split = partitionHomeVenues(venues, ['1', '2']);
    expect(split.recentlyVisited.map((item) => item.id)).toEqual([2, 1]);
    expect(split.otherVenues.map((item) => item.id)).toEqual([3]);
  });

  it('keeps catalog order for other venues when nothing is visited', () => {
    const split = partitionHomeVenues(venues, []);
    expect(split.recentlyVisited).toEqual([]);
    expect(split.otherVenues.map((item) => item.id)).toEqual([2, 1, 3]);
  });

  it('ignores visit ids that are not in the catalog', () => {
    const split = partitionHomeVenues(venues, ['missing', '1']);
    expect(split.recentlyVisited.map((item) => item.id)).toEqual([1]);
    expect(split.otherVenues.map((item) => item.id)).toEqual([2, 3]);
  });
});
