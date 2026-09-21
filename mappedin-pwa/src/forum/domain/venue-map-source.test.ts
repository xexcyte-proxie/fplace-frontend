import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAPPEDIN_MAP_ID,
  venueMapLoadKey,
  venueMapLoadRequest,
} from './venue-map-source';

describe('venueMapLoadRequest', () => {
  it('uses the venue mappedin id for catalog venues', () => {
    expect(
      venueMapLoadRequest({
        mappedinMapId: ' venue-map ',
      }),
    ).toEqual({ mapId: 'venue-map' });
  });

  it('falls back to Demo Mall when a catalog venue has no map id', () => {
    expect(
      venueMapLoadRequest({
        mappedinMapId: null,
      }),
    ).toEqual({ mapId: DEFAULT_MAPPEDIN_MAP_ID });
  });
});

describe('venueMapLoadKey', () => {
  it('changes when the map id changes', () => {
    expect(venueMapLoadKey({ mapId: 'a' })).not.toBe(
      venueMapLoadKey({ mapId: 'b' }),
    );
  });
});
