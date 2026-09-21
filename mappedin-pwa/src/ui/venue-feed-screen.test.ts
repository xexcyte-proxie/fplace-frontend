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
    expect(withNext).toContain('Show older messages');

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
    expect(html).toContain('Loading older messages…');
    expect(html).toContain('busy-indicator');
    expect(html).toMatch(/id="venue-feed-load-more-btn"[^>]*\n\s*disabled/);
  });

  it('disables send on All until a section conversation is open', () => {
    const all = renderVenueFeedScreen(
      feedState({ venueFeedDraft: 'Defense!' }),
    );
    expect(all).toMatch(/id="venue-feed-send-btn"[\s\S]*?disabled/);
    expect(all).toContain('Pick a section to chat');

    const filled = renderVenueFeedScreen(
      feedState({
        venueFeedDraft: 'Defense!',
        socialLocation: 'loc-north',
        socialLocationName: 'North Stand',
      }),
    );
    const sendButton = /<button[^>]*id="venue-feed-send-btn"[\s\S]*?>/.exec(
      filled,
    );
    expect(sendButton).not.toBeNull();
    expect(sendButton?.[0]).not.toContain('disabled');
  });

  it('lets remote visitors read posts but not compose', () => {
    const html = renderVenueFeedScreen(
      feedState({
        selectedVenueId: '1',
        forumVenues: [
          {
            id: 1,
            name: 'Riverside',
            location: 'Lagos',
            latitude: 6.45,
            longitude: 3.4,
          },
        ],
        locationPermission: 'granted',
        userLocation: { latitude: 43.64, longitude: -79.38, accuracy: 8 },
        venueFeedPosts: [post],
        venueFeedDraft: 'Defense!',
        socialLocation: '8',
        socialLocationName: 'North Stand',
      }),
    );
    expect(html).toContain('Hello section');
    expect(html).toContain("You're not at Riverside");
    expect(html).toContain('You can still browse the map and posts');
    expect(html).toContain('Posting is only available at this venue');
    expect(html).toMatch(/id="venue-feed-input"[\s\S]*?disabled/);
    expect(html).toMatch(/id="venue-feed-send-btn"[\s\S]*?disabled/);
    expect(html).not.toContain('data-venue-quick-reply');
  });

  it('shows a circular spinner on send while a post is submitting', () => {
    const html = renderVenueFeedScreen(
      feedState({ venueFeedDraft: 'Defense!', venueFeedSubmitting: true }),
    );
    expect(html).toContain('busy-indicator');
    expect(html).toContain('aria-label="Sending"');
  });

  it('marks the flag control as active once the viewer reported the post', () => {
    const unflagged = renderVenueFeedScreen(
      feedState({ venueFeedPosts: [post] }),
    );
    expect(unflagged).toContain('aria-label="0 comment(s)"');
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
      {
        id: 8,
        venue: 1,
        name: 'North Stand',
        code: 'N',
        is_active: true,
        mappedinLocationId: 'loc-north',
      },
      {
        id: 9,
        venue: 1,
        name: 'Church',
        code: '',
        is_active: true,
        mappedinLocationId: 'loc-church',
      },
    ];
    const churchPost = {
      ...post,
      id: '30',
      locationId: 'loc-church',
      content: 'At the church',
    };
    const html = renderVenueFeedScreen(
      feedState({
        venueFeedPosts: [post, churchPost],
        forumSections: sections,
        socialLocation: 'loc-church',
      }),
    );
    expect(html).toContain('At the church');
    expect(html).not.toContain('Hello section');
    expect(html).toContain('>Church</h1>');
    expect(html).toContain('Conversation · Church');
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
    expect(html).toContain('Car Park · recent messages');
    expect(html).not.toContain('>Venue feed</h1>');
  });

  it('shows a location-specific empty state instead of unrelated posts', () => {
    const sections = [
      {
        id: 9,
        venue: 1,
        name: 'Church',
        code: '',
        is_active: true,
        mappedinLocationId: 'loc-church',
      },
    ];
    const html = renderVenueFeedScreen(
      feedState({
        venueFeedPosts: [post],
        forumSections: sections,
        socialLocation: 'loc-church',
      }),
    );
    expect(html).toContain('No messages yet for Church');
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
    expect(html).toContain('No messages yet for Car Park');
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

  it('lists venue sections so a tap can open that conversation', () => {
    const html = renderVenueFeedScreen(
      feedState({
        venueFeedPosts: [post],
        forumSections: [
          {
            id: 8,
            venue: 1,
            name: 'North Stand',
            code: 'N',
            is_active: true,
            mappedinLocationId: 'loc-north',
          },
          {
            id: 9,
            venue: 1,
            name: 'Church',
            code: '',
            is_active: true,
            mappedinLocationId: 'loc-church',
          },
        ],
      }),
    );
    expect(html).toContain('data-venue-section=""');
    expect(html).toContain('All');
    expect(html).toContain('data-venue-section="loc-north"');
    expect(html).toContain('North Stand');
    expect(html).toContain('data-venue-section="loc-church"');
    expect(html).toContain('Church');
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
    expect(html).toContain('aria-label="Loading conversations"');
    expect(html).not.toContain('No messages yet');
  });

  it('does not overlay a feed that already has posts', () => {
    const html = renderVenueFeedScreen(
      feedState({ venueFeedLoading: true, venueFeedPosts: [post] }),
    );
    expect(html).not.toContain('screen-loading-overlay');
    expect(html).toContain('Hello section');
  });

  it('lists messages from every section on All', () => {
    const html = renderVenueFeedScreen(
      feedState({
        venueFeedPosts: [
          {
            ...post,
            id: '31',
            kind: 'conversation',
            location: 'North Stand',
            locationId: 'loc-north',
            content: 'From north',
          },
          {
            ...post,
            id: '32',
            kind: 'conversation',
            location: 'Church',
            locationId: 'loc-church',
            content: 'From church',
          },
        ],
        forumSections: [
          {
            id: 8,
            venue: 1,
            name: 'North Stand',
            code: 'N',
            is_active: true,
            mappedinLocationId: 'loc-north',
          },
          {
            id: 9,
            venue: 1,
            name: 'Church',
            code: '',
            is_active: true,
            mappedinLocationId: 'loc-church',
          },
        ],
      }),
    );
    expect(html).toContain('From north');
    expect(html).toContain('From church');
    expect(html).toContain('North Stand ·');
    expect(html).toContain('Church ·');
    expect(html).not.toContain('data-upvote-id');
    expect(html).toContain('Conversations');
  });

  it('renders a section conversation as chat, not a categorized post feed', () => {
    const html = renderVenueFeedScreen(
      feedState({
        venueFeedPosts: [{ ...post, kind: 'conversation', categoryId: '' }],
        forumSections: [
          { id: 8, venue: 1, name: 'North Stand', code: 'N', is_active: true },
        ],
        socialLocation: '8',
        socialLocationName: 'North Stand',
      }),
    );
    expect(html).toContain('maxlength="500"');
    expect(html).toContain('0 / 500');
    expect(html).toContain('Message North Stand');
    expect(html).toContain('Conversation · North Stand');
    expect(html).toContain('data-venue-section="8"');
    expect(html).toContain('data-venue-section-name="North Stand"');
    expect(html).not.toContain('data-upvote-id');
    expect(html).not.toContain('data-comments-id');
    expect(html).not.toContain('data-flag-id');
    expect(html).not.toContain('venue-feed-emergency');
  });

  it('keeps notify, upvote, and comments hooks on venue-wide posts', () => {
    const html = renderVenueFeedScreen(feedState({ venueFeedPosts: [post] }));
    expect(html).toContain('id="venue-feed-notify-btn"');
    expect(html).toContain('id="venue-feed-input"');
    expect(html).toContain('id="venue-feed-send-btn"');
    expect(html).toContain('data-upvote-id="21"');
    expect(html).toContain('data-comments-id="21"');
    expect(html).toContain('data-flag-id="21"');
    expect(html).toContain('Hello section');
  });

  it('escapes post content that looks like HTML', () => {
    const html = renderVenueFeedScreen(
      feedState({
        venueFeedPosts: [{ ...post, content: '<b>hi</b>' }],
      }),
    );
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).not.toContain('<b>hi</b>');
  });

  it('offers quick replies once a section conversation is open', () => {
    const html = renderVenueFeedScreen(
      feedState({
        socialLocation: 'loc-north',
        socialLocationName: 'North Stand',
      }),
    );
    expect(html).toContain('data-venue-quick-reply="Let\'s go!"');
    expect(html).toContain('data-venue-quick-reply="Defense!"');
    expect(html).toContain('data-venue-quick-reply="What a play"');
  });

  it('uses the location socket for conversation live status', () => {
    const html = renderVenueFeedScreen(
      feedState({
        venueFeedPosts: [{ ...post, kind: 'conversation' }],
        forumSections: [
          { id: 8, venue: 1, name: 'North Stand', code: 'N', is_active: true },
        ],
        socialLocation: '8',
        venueLiveStatus: 'disconnected',
        locationLiveStatus: 'connected',
      }),
    );
    expect(html).toContain('fan(s) live');
    expect(html).not.toContain('Live updates offline');
  });
});
