import { describe, expect, it, vi } from 'vitest';
import { initialAppState, type VenueFeedPost } from '../types';
import { canPatchSocialUpvotes, patchSocialUpvotes } from './social-upvote-patch';

const post = { id: '21', content: 'Great atmosphere', categoryId: '1', feedType: 'fan-vibe', upvotes: 2, hasUpvoted: false } as VenueFeedPost;
function state() {
  return { ...initialAppState(), activeTab: 'social' as const, socialPageTab: 'live-feed' as const, venueFeedPosts: [post] };
}
describe('social upvote DOM updates', () => {
  it('patches optimistic changes, confirmation and rollback without rebuilding categories', () => {
    const before = state();
    const voted = { ...before, upvotedPostIds: ['21'], venueFeedPosts: [{ ...post, upvotes: 3, hasUpvoted: true }] };
    expect(canPatchSocialUpvotes(before, voted)).toBe(true);
    expect(canPatchSocialUpvotes(voted, { ...voted, venueFeedPosts: [{ ...voted.venueFeedPosts[0] }] })).toBe(true);
    expect(canPatchSocialUpvotes(voted, before)).toBe(true);
  });
  it('rebuilds when content, category, list membership, or overlays change', () => {
    const before = state();
    expect(canPatchSocialUpvotes(before, { ...before, venueFeedPosts: [{ ...post, content: 'Edited' }] })).toBe(false);
    expect(canPatchSocialUpvotes(before, { ...before, venueFeedPosts: [{ ...post, categoryId: '2' }] })).toBe(false);
    expect(canPatchSocialUpvotes(before, { ...before, venueFeedPosts: [] })).toBe(false);
    expect(canPatchSocialUpvotes(before, { ...before, postCommentsOpen: true })).toBe(false);
    expect(canPatchSocialUpvotes(before, { ...before, activeTab: 'map' })).toBe(false);
  });
  it('changes existing vote controls while leaving all other nodes untouched', () => {
    const count = { textContent: '2' };
    const button = { dataset: { upvoteId: '21' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn(), querySelector: () => count };
    const icon = {};
    const feed = { scrollTop: 250, categoryIcon: icon, querySelectorAll: () => [button], set outerHTML(_value: string) { throw new Error('Must not replace the feed'); } };
    const root = { querySelector: () => feed } as unknown as HTMLElement;
    expect(patchSocialUpvotes(root, { ...state(), upvotedPostIds: ['21'], venueFeedPosts: [{ ...post, upvotes: 3 }] })).toBe(true);
    expect(count.textContent).toBe('3');
    expect(button.setAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
    expect(feed.categoryIcon).toBe(icon);
    expect(feed.scrollTop).toBe(250);
    patchSocialUpvotes(root, state());
    expect(count.textContent).toBe('2');
    expect(button.setAttribute).toHaveBeenCalledWith('aria-pressed', 'false');
  });
});
