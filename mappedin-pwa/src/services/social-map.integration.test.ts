import { describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { initialAppState, type VenueFeedPost } from '../types';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));

function harness() {
  const post = { id: '1', kind: 'post', content: 'Venue activity', comments: 0 } as VenueFeedPost;
  const state = { ...initialAppState(), venueFeedPosts: [post] };
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

describe('social map venue activity source', () => {
  it('keeps venue posts when a map location opens Social', () => {
    const { app, state, post } = harness();
    app.setSocialLocation('north', 'North');
    expect(state.socialLocation).toBeNull();
    expect(state.venueFeedPosts).toEqual([post]);
    app.syncSocialMapMarkers();
    expect(app.socialMapMarkers.syncState.mock.lastCall[0].venueFeedPosts).toEqual([post]);
  });
  it('keeps map activity current for comments, votes and hidden posts', () => {
    const { app } = harness();
    app.mergeLiveForumComment({ id: 22, post: 1 });
    app.applyVenueLiveEvent({ type: 'upvote_update', update: { postId: 1, upvotesCount: 7 } });
    app.syncSocialMapMarkers();
    expect(app.socialMapMarkers.syncState.mock.lastCall[0].venueFeedPosts[0]).toMatchObject({ comments: 1, upvotes: 7 });
    app.applyVenueLiveEvent({ type: 'post_hidden', postId: 1 });
    expect(app.socialMapMarkers.syncState.mock.lastCall[0].venueFeedPosts).toEqual([]);
  });
});
