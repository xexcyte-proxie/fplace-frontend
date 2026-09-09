import { describe, expect, it } from 'vitest';

import { applyVenueLiveEvent } from './apply-venue-live-event';
import type { ForumComment, ForumPost, VenueLiveSnapshot } from './entities';

function post(overrides: Partial<ForumPost> = {}): ForumPost {
  return {
    id: 10,
    user: { id: 2, display_name: 'Alex' },
    venue: 1,
    section: 4,
    category: 3,
    content: 'Let\'s go',
    upvotes_count: 1,
    flags_count: 0,
    status: 'visible',
    has_upvoted: false,
    created_at: '2026-09-02T10:00:00.000Z',
    updated_at: '2026-09-02T10:00:00.000Z',
    ...overrides,
  };
}

function snapshot(overrides: Partial<VenueLiveSnapshot> = {}): VenueLiveSnapshot {
  return {
    posts: [post()],
    heatmap: [],
    heatmapActive: false,
    ...overrides,
  };
}

describe('applyVenueLiveEvent', () => {
  it('prepends a new_post and ignores a different venue', () => {
    const incoming = post({ id: 11, content: 'New shout' });
    const next = applyVenueLiveEvent(snapshot(), {
      type: 'new_post',
      post: incoming,
    });
    expect(next.snapshot.posts.map((row) => row.id)).toEqual([11, 10]);

    const ignored = applyVenueLiveEvent(
      snapshot(),
      { type: 'new_post', post: post({ id: 12, venue: 99 }) },
      1,
    );
    expect(ignored.snapshot.posts.map((row) => row.id)).toEqual([10]);
  });

  it('patches upvotes without dropping the existing post body', () => {
    const next = applyVenueLiveEvent(snapshot(), {
      type: 'upvote_update',
      update: { postId: 10, upvotesCount: 8, upvoted: true },
    });
    expect(next.snapshot.posts[0]).toMatchObject({
      id: 10,
      content: "Let's go",
      upvotes_count: 8,
      has_upvoted: true,
    });
  });

  it('removes hidden posts and activates heatmap rows', () => {
    const hidden = applyVenueLiveEvent(snapshot(), {
      type: 'post_hidden',
      postId: 10,
    });
    expect(hidden.snapshot.posts).toEqual([]);

    const heat = applyVenueLiveEvent(snapshot(), {
      type: 'section_heat_update',
      heatmap: [{ sectionId: 4, postCount: 6, priority: 'high' }],
    });
    expect(heat.snapshot.heatmapActive).toBe(true);
    expect(heat.snapshot.heatmap[0]?.postCount).toBe(6);
  });

  it('surfaces new_comment without mutating the post list', () => {
    const comment: ForumComment = {
      id: 50,
      post: 10,
      user: { id: 7, display_name: 'Sam' },
      content: 'Fire',
      created_at: '2026-09-02T10:01:00.000Z',
      updated_at: '2026-09-02T10:01:00.000Z',
    };
    const current = snapshot();
    const next = applyVenueLiveEvent(current, { type: 'new_comment', comment });
    expect(next.snapshot).toBe(current);
    expect(next.liveComment).toEqual(comment);
  });
});
