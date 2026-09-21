import { describe, expect, it } from 'vitest';

import type { ForumComment } from '../forum/domain/entities';
import {
  appendCommentOnce,
  mapForumCommentToItem,
  mapForumCommentsToItems,
} from './post-comments-data';
import type { PostCommentItem } from '../types';

const comment = (id: number, content: string): PostCommentItem => ({
  id,
  postId: 21,
  authorId: 4,
  author: 'Olasax',
  initials: 'OL',
  avatarColor: '#7c3aed',
  content,
  timeAgo: 'just now',
  createdAt: '2026-09-03T14:30:00.000Z',
});

function forumComment(
  overrides: Partial<ForumComment> & Pick<ForumComment, 'id'>,
): ForumComment {
  return {
    post: 21,
    user: { id: 4, display_name: 'Jordan Lee' },
    content: 'Line is moving',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('mapForumCommentToItem', () => {
  it('maps API comment fields onto the thread item', () => {
    const createdAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const item = mapForumCommentToItem(
      forumComment({ id: 9, created_at: createdAt }),
    );
    expect(item).toMatchObject({
      id: 9,
      postId: 21,
      authorId: 4,
      author: 'Jordan Lee',
      initials: 'JL',
      avatarColor: '#db2777',
      content: 'Line is moving',
      createdAt,
    });
    expect(item.timeAgo).toBe('5m');
  });

  it('falls back to Fan and FA when display_name is blank', () => {
    const item = mapForumCommentToItem(
      forumComment({
        id: 1,
        user: { id: 0, display_name: '   ' },
      }),
    );
    expect(item.author).toBe('Fan');
    expect(item.initials).toBe('FA');
    expect(item.avatarColor).toBe('#3b5998');
  });
});

describe('mapForumCommentsToItems', () => {
  it('maps each API row in order', () => {
    const items = mapForumCommentsToItems([
      forumComment({ id: 1, content: 'a' }),
      forumComment({ id: 2, content: 'b' }),
    ]);
    expect(items.map((item) => item.id)).toEqual([1, 2]);
    expect(items.map((item) => item.content)).toEqual(['a', 'b']);
  });
});

describe('appendCommentOnce', () => {
  it('appends a comment that is not in the thread yet', () => {
    const next = appendCommentOnce([comment(1, 'yo')], comment(2, 'yeah'));
    expect(next.map((item) => item.id)).toEqual([1, 2]);
  });

  it('does not append the same comment twice (REST vs WebSocket race)', () => {
    const existing = [comment(1, 'yo'), comment(2, 'yeah')];
    const next = appendCommentOnce(existing, comment(2, 'yeah'));
    expect(next).toBe(existing);
    expect(next).toHaveLength(2);
  });
});
