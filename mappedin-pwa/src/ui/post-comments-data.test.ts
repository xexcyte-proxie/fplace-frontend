import { describe, expect, it } from 'vitest';

import { appendCommentOnce } from './post-comments-data';
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
