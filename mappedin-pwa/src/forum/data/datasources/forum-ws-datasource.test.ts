import { describe, expect, it } from 'vitest';

import { parseVenueLiveMessage } from './forum-ws-datasource';

const postPayload = {
  id: 44,
  user: { id: 3, display_name: 'Riley' },
  venue: 1,
  section: 2,
  category: 5,
  content: 'What a play',
  upvotes_count: 2,
  flags_count: 0,
  status: 'visible',
  has_upvoted: false,
  created_at: '2026-09-02T10:00:00.000Z',
};

describe('parseVenueLiveMessage', () => {
  it('parses nested new_post and post_updated aliases', () => {
    const created = parseVenueLiveMessage({
      type: 'new_post',
      post: postPayload,
    });
    expect(created).toMatchObject({
      type: 'new_post',
      post: { id: 44, content: 'What a play' },
    });

    const updated = parseVenueLiveMessage({
      event: 'post_updated',
      payload: { ...postPayload, content: 'Edited' },
    });
    expect(updated).toMatchObject({
      type: 'new_post',
      post: { id: 44, content: 'Edited' },
    });
  });

  it('parses upvote, hide, heatmap, and comment events', () => {
    expect(
      parseVenueLiveMessage({
        type: 'upvote_update',
        post_id: 44,
        upvotes_count: 9,
        upvoted: true,
      }),
    ).toEqual({
      type: 'upvote_update',
      update: { postId: 44, upvotesCount: 9, upvoted: true },
    });

    expect(
      parseVenueLiveMessage({ type: 'post_hidden', payload: { postId: 44 } }),
    ).toEqual({ type: 'post_hidden', postId: 44 });

    expect(
      parseVenueLiveMessage({
        type: 'section_heat_update',
        data: {
          heatmap: [
            { section_id: 2, post_count: 4, priority: 'HIGH' },
            { sectionId: 'bad' },
          ],
        },
      }),
    ).toEqual({
      type: 'section_heat_update',
      heatmap: [{ sectionId: 2, postCount: 4, priority: 'high' }],
    });

    expect(
      parseVenueLiveMessage({
        type: 'comment_created',
        comment: {
          id: 8,
          post: 44,
          user: { id: 3, display_name: 'Riley' },
          content: 'Facts',
          created_at: '2026-09-02T10:02:00.000Z',
        },
      }),
    ).toMatchObject({
      type: 'new_comment',
      comment: { id: 8, post: 44, content: 'Facts' },
    });
  });

  it('ignores unknown or malformed frames', () => {
    expect(parseVenueLiveMessage(null)).toBeNull();
    expect(parseVenueLiveMessage({ type: 'typing' })).toBeNull();
    expect(parseVenueLiveMessage({ type: 'new_post', post: { id: 1 } })).toBeNull();
  });
});
