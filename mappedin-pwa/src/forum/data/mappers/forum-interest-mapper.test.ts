import { describe, expect, it } from 'vitest';

import {
  coerceForumInterest,
  coerceForumInterestList,
} from './forum-interest-mapper';

describe('coerceForumInterest', () => {
  it('reads catalog rows and defaults is_active to true', () => {
    expect(
      coerceForumInterest({
        id: 1,
        name: 'Home team',
        slug: 'home-team',
        order: 2,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-02T00:00:00Z',
      }),
    ).toEqual({
      id: 1,
      name: 'Home team',
      slug: 'home-team',
      order: 2,
      is_active: true,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
    });
  });

  it('rejects rows without a name', () => {
    expect(coerceForumInterest({ id: 1 })).toBeNull();
    expect(coerceForumInterest(null)).toBeNull();
  });
});

describe('coerceForumInterestList', () => {
  it('maps paginated results', () => {
    expect(
      coerceForumInterestList({
        count: 1,
        next: 'https://api.example.com/api/forum/interests/?page=2',
        previous: null,
        results: [{ id: 1, name: 'Live music', slug: 'live-music', order: 1 }],
      }),
    ).toMatchObject({
      count: 1,
      next: 'https://api.example.com/api/forum/interests/?page=2',
      results: [{ id: 1, name: 'Live music', is_active: true }],
    });
  });
});
