import { describe, expect, it } from 'vitest';

import { renderPostCommentsScreen } from './post-comments-screen';
import { initialAppState } from '../types';
import type { VenueFeedPost } from '../types';

const samplePost: VenueFeedPost = {
  id: '12',
  author: 'Fan',
  authorId: 1,
  initials: 'FA',
  avatarColor: '#3b5998',
  location: 'North',
  locationId: '3',
  timeAgo: '1m',
  feedType: 'fan-vibe',
  categoryId: '1',
  content: 'Hello section',
  upvotes: 2,
  comments: 0,
};

describe('renderPostCommentsScreen', () => {
  it('keeps composer and back hooks used by ui-root-events', () => {
    const html = renderPostCommentsScreen(initialAppState(), samplePost);
    expect(html).toContain('id="post-comments-back-btn"');
    expect(html).toContain('aria-label="Back"');
    expect(html).toContain('id="post-comments-form"');
    expect(html).toContain('id="post-comments-input"');
    expect(html).toContain('id="post-comments-send-btn"');
    expect(html).toContain('aria-label="Send comment"');
    expect(html).toContain('No comments yet. Start the thread.');
  });

  it('shows owner edit/delete hooks and a delete control on the author comment', () => {
    const state = initialAppState();
    state.authUser = {
      id: 1,
      email: 'fan@email.com',
      pseudo_name: 'Fan',
      is_email_verified: true,
      created_at: '',
      updated_at: '',
    };
    state.postComments = [
      {
        id: 9,
        postId: 12,
        authorId: 1,
        author: 'Fan',
        initials: 'FA',
        avatarColor: '#3b5998',
        content: 'Nice one',
        timeAgo: 'just now',
        createdAt: '2026-09-03T14:30:00.000Z',
      },
    ];

    const html = renderPostCommentsScreen(state, samplePost);
    expect(html).toContain('id="post-comments-edit-btn"');
    expect(html).toContain('id="post-comments-delete-post-btn"');
    expect(html).toContain('data-comment-id="9"');
    expect(html).toContain('data-delete-comment-id="9"');
    expect(html).toContain('Nice one');
    expect(html).not.toContain('No comments yet. Start the thread.');
  });

  it('escapes comment content that looks like HTML', () => {
    const state = initialAppState();
    state.postComments = [
      {
        id: 9,
        postId: 12,
        authorId: 2,
        author: 'Fan',
        initials: 'FA',
        avatarColor: '#3b5998',
        content: '<b>hi</b>',
        timeAgo: 'just now',
        createdAt: '2026-09-03T14:30:00.000Z',
      },
    ];

    const html = renderPostCommentsScreen(state, samplePost);
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).not.toContain('<b>hi</b>');
    expect(html).not.toContain('data-delete-comment-id');
  });

  it('shows a missing-post empty state', () => {
    const html = renderPostCommentsScreen(initialAppState(), null);
    expect(html).toContain('Post not found.');
    expect(html).toMatch(/id="post-comments-input"[\s\S]*?disabled/);
  });
});
