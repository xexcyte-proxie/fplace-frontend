import { describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { initialAppState, type VenueFeedPost } from '../types';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));

function harness() {
  const post = { id: '1', kind: 'post', content: 'Venue activity', comments: 0, upvotes: 2, authorId: 1 } as VenueFeedPost;
  const state: any = { ...initialAppState(), venueFeedPosts: [post], authUser: { id: 1, stat: { posts_count: 8, upvotes_count: 20, venues_count: 1 }, recent_posts: [] } };
  const app = Object.create(MapApp.prototype) as any;
  Object.assign(app, {
    store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) },
    socialMapMarkers: { syncState: vi.fn() },
    homeFeedSnapshot: null, venueWideFeedSnapshot: null,
    allConversationNextPages: new Map(), seenForumCommentIds: new Set(),
    captureVenueFeedDraft: () => '', loadConversationFeed: vi.fn(),
  });
  return { app, state, post };
}

describe('profile vote totals', () => {
  it('updates immediately, deduplicates live confirmation, and rolls back', () => {
    const { app, state } = harness();
    state.authUser.recent_posts = [{ id: 1, upvotes_count: 2 }];
    app.applyOptimisticVenueFeedUpvote('1', true);
    expect(state.authUser.stat.upvotes_count).toBe(21);
    expect(state.authUser.recent_posts[0].upvotes_count).toBe(3);
    expect(state.venueFeedPosts[0].upvotes).toBe(3);
    expect(state.upvotedPostIds).toEqual(['1']);
    app.applyVenueLiveEvent({ type: 'upvote_update', update: { postId: 1, upvotesCount: 3 } });
    expect(state.authUser.stat.upvotes_count).toBe(21);
    app.applyOptimisticVenueFeedUpvote('1', false, 2);
    expect(state.authUser.stat.upvotes_count).toBe(20);
    expect(state.authUser.recent_posts[0].upvotes_count).toBe(2);
    expect(state.upvotedPostIds).toEqual([]);
  });
  it('updates own category posts without double counting', () => {
    const { app, state } = harness();
    app.applyOptimisticVenueFeedUpvote('1', true);
    expect(state.authUser.stat.upvotes_count).toBe(21);
    app.applyVenueLiveEvent({ type: 'upvote_update', update: { postId: 1, upvotesCount: 3 } });
    expect(state.authUser.stat.upvotes_count).toBe(21);
    app.applyVenueLiveEvent({ type: 'upvote_update', update: { postId: 1, upvotesCount: 5 } });
    expect(state.authUser.stat.upvotes_count).toBe(23);
    expect(state.venueFeedPosts[0].upvotes).toBe(5);
  });
  it('does not add votes on other authors to received totals', () => {
    const { app, state, post } = harness();
    post.authorId = 2;
    app.applyOptimisticVenueFeedUpvote('1', true);
    expect(state.authUser.stat.upvotes_count).toBe(20);
    expect(state.venueFeedPosts[0].upvotes).toBe(3);
  });
});
