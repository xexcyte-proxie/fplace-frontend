import { describe, expect, it } from 'vitest';

import { withRecentPostUpvotes } from './profile-recent-posts';
import type { ProfileRecentPost } from './entities';

const sample: ProfileRecentPost = {
  id: 21,
  content: 'That goal just shook the whole north stand.',
  section: null,
  venue: 1,
  upvotes_count: 248,
  created_at: '2026-09-15T10:00:00.000Z',
};

describe('withRecentPostUpvotes', () => {
  it('updates the matching recent post count', () => {
    const next = withRecentPostUpvotes([sample], 21, 249);
    expect(next).toEqual([{ ...sample, upvotes_count: 249 }]);
  });

  it('returns the same array when the count is unchanged', () => {
    const posts = [sample];
    expect(withRecentPostUpvotes(posts, 21, 248)).toBe(posts);
  });

  it('leaves other posts untouched', () => {
    const other = { ...sample, id: 22, upvotes_count: 3 };
    const next = withRecentPostUpvotes([sample, other], 22, 4);
    expect(next?.[0]).toBe(sample);
    expect(next?.[1]).toEqual({ ...other, upvotes_count: 4 });
  });
});
