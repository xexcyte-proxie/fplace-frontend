import { describe, expect, it } from 'vitest';

import {
  IndoorAtlasFloorFilter,
  validateVenueFloorMap,
} from './indoorAtlasFloorFilter';

describe('IndoorAtlas floor mapping safety', () => {
  it('rejects the former placeholder pattern where every level is one floor', () => {
    expect(
      validateVenueFloorMap({
        venueMapId: 'venue',
        floors: [
          { iaLevel: 0, mappedinFloorId: 'floor-a' },
          { iaLevel: 1, mappedinFloorId: 'floor-a' },
        ],
      }),
    ).toContain('all_levels_map_to_one_floor');
  });

  it('rejects empty and duplicate mappings', () => {
    expect(validateVenueFloorMap({ venueMapId: '', floors: [] })).toEqual([
      'missing_venue_map_id',
      'missing_floor_mappings',
    ]);
    expect(
      validateVenueFloorMap({
        venueMapId: 'venue',
        floors: [
          { iaLevel: 0, mappedinFloorId: 'floor-a' },
          { iaLevel: 0, mappedinFloorId: 'floor-b' },
        ],
      }),
    ).toContain('duplicate_ia_level');
  });

  it('keeps IndoorAtlas disabled until the selected venue has a valid map', () => {
    const filter = new IndoorAtlasFloorFilter('ltv-8');
    expect(filter.isConfigured()).toBe(false);
    expect(filter.accept(0, 1)).toEqual({
      accepted: false,
      reason: 'unmapped_ia_level',
    });
  });
});
