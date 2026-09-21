import { describe, expect, it } from 'vitest';
import type { MapData } from '@mappedin/mappedin-js';

import { collectLocationAnchors } from './location-anchors';

function fakeMapData(options: {
  profiles?: Array<{ id: string; name: string; spaceId: string }>;
  spaces?: Array<{ id: string; name: string }>;
}): MapData {
  const profiles = options.profiles ?? [];
  const spaces = options.spaces ?? [];
  return {
    getByType(type: string) {
      if (type === 'location-profile') {
        return profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          spaces: [{ id: profile.spaceId }],
        }));
      }
      if (type === 'space') return spaces;
      return [];
    },
    getById() {
      return null;
    },
  } as unknown as MapData;
}

describe('collectLocationAnchors', () => {
  it('uses the Mappedin location-profile id as the conversation location id', () => {
    const anchors = collectLocationAnchors(
      fakeMapData({
        profiles: [
          { id: 'loc-north', name: 'North Stand', spaceId: 'space-1' },
        ],
        spaces: [
          { id: 'space-1', name: 'North Stand' },
          { id: 'space-2', name: 'Apple' },
        ],
      }),
    );
    expect(anchors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'space-1',
          locationId: 'loc-north',
          name: 'North Stand',
        }),
        expect.objectContaining({
          id: 'space-2',
          locationId: 'space-2',
          name: 'Apple',
        }),
      ]),
    );
  });
});
