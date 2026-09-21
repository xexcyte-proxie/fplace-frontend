import { describe, expect, it } from 'vitest';

import {
  coerceForumSection,
  coerceForumSectionList,
} from './forum-section-mapper';

describe('coerceForumSection', () => {
  it('reads mappedin_location_id from the section payload', () => {
    expect(
      coerceForumSection({
        id: 5,
        venue: 3,
        name: 'North Stand',
        code: '',
        is_active: true,
        mappedin_location_id: ' loc-north ',
        created_at: '2026-09-13T18:54:35.136503Z',
        updated_at: '2026-09-13T19:18:22.532040Z',
      }),
    ).toMatchObject({
      id: 5,
      mappedin_location_id: 'loc-north',
    });
  });

  it('treats a missing location id as null', () => {
    expect(
      coerceForumSection({
        id: 5,
        venue: 3,
        name: 'North Stand',
        created_at: '2026-09-13T18:54:35.136503Z',
        updated_at: '2026-09-13T19:18:22.532040Z',
      })?.mappedin_location_id,
    ).toBeNull();
  });
});

describe('coerceForumSectionList', () => {
  it('maps paginated results', () => {
    const list = coerceForumSectionList({
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 7, venue: 3, name: 'VIP' }],
    });
    expect(list.results).toHaveLength(1);
    expect(list.results[0]?.mappedin_location_id).toBeNull();
  });
});
