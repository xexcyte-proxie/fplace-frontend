import { describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { initialAppState, type VenueFeedPost } from '../types';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));

function harness() {
  const posts = [1, 2, 3].map(id => ({ id: String(id), kind: 'post' }) as VenueFeedPost);
  const state = { ...initialAppState(), venueFeedPosts: posts, forumFeedCount: 8, forumFeedNext: '?page=2' };
  const app = Object.create(MapApp.prototype) as any;
  Object.assign(app, {
    store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) },
    homeFeedSnapshot: null, venueWideFeedSnapshot: null, venueFeedScopeGeneration: 0,
    allConversationNextPages: new Map(), captureSocialDraft: () => '',
    captureVenueFeedDraft: () => '', disconnectLocationLiveFeed: vi.fn(),
    loadConversationFeed: vi.fn(),
  });
  return { app, state, posts };
}

describe('venue post navigation', () => {
  it('preserves a pending feed request when leaving and reopening Social', () => {
    const { app, state } = harness();
    Object.assign(state, { activeTab: 'social', venueFeedLoading: true, venueFeedPosts: [] });
    app.setActiveTab('home');
    expect(state.venueFeedLoading).toBe(true);
    expect(app.venueFeedScopeGeneration).toBe(0);
    app.setActiveTab('social');
    expect(state.venueFeedLoading).toBe(true);
  });

  it('opens the same posts and pagination from Social and View all posts', () => {
    const social = harness();
    const discover = harness();
    social.app.setActiveTab('social');
    discover.app.openVenueDiscover();
    expect(social.state).toEqual(discover.state);
    expect(social.state.venueFeedPosts).toEqual(social.posts);
    expect(social.state.forumFeedNext).toBe('?page=2');
    expect(social.state.forumFeedCount).toBe(8);
    social.app.setActiveTab('social');
    expect(social.state.venueFeedPosts).toEqual(social.posts);
  });
});
