import { describe, expect, it, vi } from 'vitest';
import { initialAppState } from '../types';
import { canPatchProfileUpvotes, patchProfileUpvotes } from './profile-upvote-patch';

function profileState() {
  return {
    ...initialAppState(), activeTab: 'profile' as const, profileView: 'main' as const,
    authUser: {
      id: 1, email: 'fan@example.com', pseudo_name: 'Fan',
      is_email_verified: true, created_at: '', updated_at: '',
      stat: { posts_count: 1, upvotes_count: 2, venues_count: 1 },
      recent_posts: [{ id: 21, content: 'Hello', section: null, venue: 1,
        upvotes_count: 2, created_at: new Date().toISOString() }],
    },
  };
}

describe('profile upvote patch', () => {
  it('handles optimistic votes, server confirmation, and rollback in place', () => {
    const previous = profileState();
    const next = { ...previous, upvotedPostIds: ['21'], venueFeedPosts: [],
      authUser: { ...previous.authUser,
        stat: { ...previous.authUser.stat, upvotes_count: 3 },
        recent_posts: previous.authUser.recent_posts.map((post) => ({ ...post, upvotes_count: 3 })),
      },
    };
    expect(canPatchProfileUpvotes(previous, next)).toBe(true);
    expect(canPatchProfileUpvotes(next, { ...next, authUser: { ...next.authUser } })).toBe(true);
    expect(canPatchProfileUpvotes(next, previous)).toBe(true);
    expect(canPatchProfileUpvotes(previous, { ...previous, upvotedPostIds: ['21'] })).toBe(true);
  });

  it('rebuilds for navigation, overlays, or changed profile content', () => {
    const previous = profileState();
    expect(canPatchProfileUpvotes(previous, { ...previous, activeTab: 'social' })).toBe(false);
    expect(canPatchProfileUpvotes(previous, { ...previous, profileView: 'settings' })).toBe(false);
    expect(canPatchProfileUpvotes(previous, { ...previous, toast: 'Failed' })).toBe(false);
    expect(canPatchProfileUpvotes(previous, { ...previous,
      authUser: { ...previous.authUser, recent_posts: [] } })).toBe(false);
    expect(canPatchProfileUpvotes(previous, { ...previous,
      authUser: { ...previous.authUser, pseudo_name: 'New name' } })).toBe(false);
  });

  it('updates the existing controls and total without replacing the screen', () => {
    const count = { textContent: '0' };
    const total = { textContent: '0' };
    const button = { dataset: { upvoteId: '21' }, classList: { toggle: vi.fn() },
      setAttribute: vi.fn(), querySelector: () => count };
    const screen = { scrollTop: 280, querySelectorAll: () => [button], querySelector: () => total };
    const root = { querySelector: () => screen } as unknown as HTMLElement;
    const state = { ...profileState(), upvotedPostIds: ['21'] };
    expect(patchProfileUpvotes(root, state)).toBe(true);
    expect(screen.scrollTop).toBe(280);
    expect(button.classList.toggle).toHaveBeenCalledWith('is-active', true);
    expect(button.setAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
    expect(count.textContent).toBe('2');
    expect(total.textContent).toBe('2');
    patchProfileUpvotes(root, { ...state, upvotedPostIds: [] });
    expect(button.setAttribute).toHaveBeenCalledWith('aria-label', 'Upvote');
  });
});
