import { describe, expect, it } from 'vitest';

import { coerceAuthSession, coerceAuthUser } from './auth-user-mapper';

describe('coerceAuthUser', () => {
  it('reads stat and recent_posts from the profile payload', () => {
    const user = coerceAuthUser({
      id: 1,
      email: 'fan@email.com',
      pseudo_name: 'RowdyGull_47',
      is_email_verified: true,
      user_type: 'regular_user',
      stat: {
        posts_count: 86,
        upvotes_count: 3200,
        venues_count: 14,
      },
      recent_posts: [
        {
          id: 21,
          content: 'That goal just shook the whole north stand.',
          section: 8,
          venue: 1,
          upvotes_count: 248,
          created_at: '2026-09-02T10:00:00.000Z',
        },
      ],
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-09-02T10:00:00.000Z',
    });

    expect(user).toMatchObject({
      id: 1,
      email: 'fan@email.com',
      pseudo_name: 'RowdyGull_47',
      stat: { posts_count: 86, upvotes_count: 3200, venues_count: 14 },
    });
    expect(user?.recent_posts).toEqual([
      {
        id: 21,
        content: 'That goal just shook the whole north stand.',
        section: 8,
        venue: 1,
        upvotes_count: 248,
        created_at: '2026-09-02T10:00:00.000Z',
      },
    ]);
  });

  it('accepts stats alias and nested post payloads', () => {
    const user = coerceAuthUser({
      id: 2,
      email: 'a@b.com',
      isEmailVerified: true,
      stats: { postsCount: 3, upvotesCount: 4, venuesCount: 1 },
      recentPosts: [{ post: { id: 9, content: 'Hello section' } }],
      createdAt: '2026-08-01T00:00:00.000Z',
    });
    expect(user?.stat).toEqual({
      posts_count: 3,
      upvotes_count: 4,
      venues_count: 1,
    });
    expect(user?.recent_posts?.[0]).toMatchObject({
      id: 9,
      content: 'Hello section',
    });
  });

  it('rejects a payload without id or email', () => {
    expect(coerceAuthUser({ email: 'a@b.com' })).toBeNull();
    expect(coerceAuthUser(null)).toBeNull();
  });

  it('keeps handle-style values as pseudo-names', () => {
    const user = coerceAuthUser({
      id: 3,
      email: 'azeezat@example.com',
      pseudo_name: 'Azeezat@fplaces',
      is_email_verified: true,
    });
    expect(user?.pseudo_name).toBe('Azeezat@fplaces');
  });
});

describe('coerceAuthSession', () => {
  it('requires tokens and a coercible user', () => {
    expect(
      coerceAuthSession({
        access: 'a',
        refresh: 'r',
        user: { id: 1, email: 'fan@email.com', is_email_verified: true },
      }),
    ).toMatchObject({
      access: 'a',
      refresh: 'r',
      user: { id: 1, email: 'fan@email.com' },
    });
    expect(coerceAuthSession({ access: 'a', refresh: 'r' })).toBeNull();
  });
});
