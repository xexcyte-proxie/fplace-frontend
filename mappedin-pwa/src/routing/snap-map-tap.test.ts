import { describe, expect, it } from 'vitest';

import { pickNearestSnapFeature } from './snap-map-tap';

describe('pickNearestSnapFeature', () => {
  it('returns the nearest feature within the max distance', () => {
    expect(
      pickNearestSnapFeature(
        [
          { distance: 4, feature: { id: 'a' } },
          { distance: 9, feature: { id: 'b' } },
        ],
        6,
      ),
    ).toEqual({ id: 'a' });
  });

  it('rejects hits that are too far from the tap', () => {
    expect(
      pickNearestSnapFeature([{ distance: 12, feature: { id: 'far' } }], 6),
    ).toBeNull();
  });

  it('returns null for empty results', () => {
    expect(pickNearestSnapFeature(undefined)).toBeNull();
    expect(pickNearestSnapFeature([])).toBeNull();
  });
});
