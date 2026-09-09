import { describe, expect, it } from 'vitest';

import { renderVenueFeedScreen } from './venue-feed-screen';
import { initialAppState } from '../types';
import type { AppState, VenueFeedPost } from '../types';

function feedState(overrides?: Partial<AppState>): AppState {
  const state = initialAppState();
  state.activeTab = 'social';
  return Object.assign(state, overrides);
}

const post: VenueFeedPost = {
  id: '21',
  author: 'Jordan',
  authorId: 4,
  initials: 'JO',
  avatarColor: '#3b5998',
  location: 'North Stand',
  locationId: '8',
  timeAgo: '1m ago',
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  feedType: 'fan-vibe',
  categoryId: '1',
  content: 'Hello section',
  upvotes: 2,
  comments: 0,
};

describe('renderVenueFeedScreen', () => {
  it('shows the load-more control only when the feed has a next page', () => {
    const withNext = renderVenueFeedScreen(
      feedState({
        forumFeedNext: 'https://api.example.com/api/forum/posts/?page=2',
      }),
    );
    expect(withNext).toContain('id="venue-feed-load-more-btn"');
    expect(withNext).toContain('Show older posts');

    const withoutNext = renderVenueFeedScreen(feedState());
    expect(withoutNext).not.toContain('id="venue-feed-load-more-btn"');
  });

  it('disables the load-more control while an older page is loading', () => {
    const html = renderVenueFeedScreen(
      feedState({
        forumFeedNext: 'https://api.example.com/api/forum/posts/?page=2',
        venueFeedLoadingMore: true,
      }),
    );
    expect(html).toContain('Loading older posts…');
    expect(html).toMatch(/id="venue-feed-load-more-btn"[^>]*\n\s*disabled/);
  });

  it('disables the send button until the draft has content', () => {
    const empty = renderVenueFeedScreen(feedState({ venueFeedDraft: '  ' }));
    expect(empty).toMatch(/id="venue-feed-send-btn"[\s\S]*?disabled/);

    const filled = renderVenueFeedScreen(
      feedState({ venueFeedDraft: 'Defense!' }),
    );
    const sendButton = /<button[^>]*id="venue-feed-send-btn"[\s\S]*?>/.exec(
      filled,
    );
    expect(sendButton).not.toBeNull();
    expect(sendButton?.[0]).not.toContain('disabled');
  });

  it('marks the flag control as active once the viewer reported the post', () => {
    const unflagged = renderVenueFeedScreen(
      feedState({ venueFeedPosts: [post] }),
    );
    const unflaggedButton =
      /<button[^>]*data-flag-id="21"[\s\S]*?<\/button>/.exec(unflagged);
    expect(unflaggedButton?.[0]).toContain('aria-pressed="false"');
    expect(unflaggedButton?.[0]).toContain('aria-label="Report"');
    expect(unflaggedButton?.[0]).not.toContain('is-active');

    const flagged = renderVenueFeedScreen(
      feedState({ venueFeedPosts: [post], flaggedPostIds: ['21'] }),
    );
    const flaggedButton =
      /<button[^>]*data-flag-id="21"[\s\S]*?<\/button>/.exec(flagged);
    expect(flaggedButton?.[0]).toContain('is-active');
    expect(flaggedButton?.[0]).toContain('aria-pressed="true"');
    expect(flaggedButton?.[0]).toContain('aria-label="Remove report"');
    expect(flaggedButton?.[0]).toContain('fill="currentColor"');
  });

  it('scopes the feed to a tapped map location that matches a section', () => {
    const sections = [
      { id: 8, venue: 1, name: 'North Stand', code: 'N', is_active: true },
      { id: 9, venue: 1, name: 'Church', code: '', is_active: true },
    ];
    const churchPost = { ...post, id: '30', locationId: '9', content: 'At the church' };
    const html = renderVenueFeedScreen(
      feedState({
        venueFeedPosts: [post, churchPost],
        forumSections: sections,
        socialLocation: 'church',
      }),
    );
    expect(html).toContain('At the church');
    expect(html).not.toContain('Hello section');
    expect(html).toContain('>Church</h1>');
    expect(html).toContain('Posts for Church');
    expect(html).toContain('id="venue-feed-clear-location-btn"');
  });

  it('titles the feed with the tapped map area name', () => {
    const html = renderVenueFeedScreen(
      feedState({
        venueFeedPosts: [post],
        forumSections: [],
        socialLocation: 'car-park',
        socialLocationName: 'Car Park',
      }),
    );
    expect(html).toContain('>Car Park</h1>');
    expect(html).toContain('Car Park · recent posts');
    expect(html).not.toContain('>Venue feed</h1>');
  });

  it('shows a location-specific empty state instead of unrelated posts', () => {
    const sections = [
      { id: 9, venue: 1, name: 'Church', code: '', is_active: true },
    ];
    const html = renderVenueFeedScreen(
      feedState({
        venueFeedPosts: [post],
        forumSections: sections,
        socialLocation: 'church',
      }),
    );
    expect(html).toContain('No posts yet for Church');
    expect(html).not.toContain('Hello section');
  });

  it('does not show venue-wide posts for a location with no matching section', () => {
    const html = renderVenueFeedScreen(
      feedState({
        venueFeedPosts: [post],
        forumSections: [],
        socialLocation: 'car-park',
        socialLocationName: 'Car Park',
      }),
    );
    expect(html).not.toContain('Hello section');
    expect(html).toContain('No posts yet for Car Park');
    expect(html).toContain('id="venue-feed-clear-location-btn"');
  });

  it('claims "fans live" only while the venue socket is connected', () => {
    const connected = renderVenueFeedScreen(
      feedState({ venueFeedPosts: [post], venueLiveStatus: 'connected' }),
    );
    expect(connected).toContain('fan(s) live');

    const idle = renderVenueFeedScreen(
      feedState({ venueFeedPosts: [post], venueLiveStatus: 'idle' }),
    );
    expect(idle).not.toContain('fan(s) live');
    expect(idle).toContain('recent posts');

    const offline = renderVenueFeedScreen(
      feedState({ venueFeedPosts: [post], venueLiveStatus: 'disconnected' }),
    );
    expect(offline).not.toContain('fan(s) live');
    expect(offline).toContain('Live updates offline');
  });

  it('renders a fresh time-ago label from createdAt', () => {
    const stalePost = {
      ...post,
      timeAgo: 'just now',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    };
    const html = renderVenueFeedScreen(
      feedState({ venueFeedPosts: [stalePost] }),
    );
    expect(html).toContain('2h ago');
    expect(html).not.toContain('just now');
  });

  it('shows a circular overlay while the empty conversation feed is loading', () => {
    const html = renderVenueFeedScreen(
      feedState({ venueFeedLoading: true, venueFeedPosts: [] }),
    );
    expect(html).toContain('screen-loading-overlay');
    expect(html).toContain('aria-label="Loading posts"');
    expect(html).not.toContain('No posts yet');
  });

  it('does not overlay a feed that already has posts', () => {
    const html = renderVenueFeedScreen(
      feedState({ venueFeedLoading: true, venueFeedPosts: [post] }),
    );
    expect(html).not.toContain('screen-loading-overlay');
    expect(html).toContain('Hello section');
  });
});
