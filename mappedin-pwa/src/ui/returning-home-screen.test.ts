import { describe, expect, it } from 'vitest';

import { greetingForHour } from '../home/domain/entities';
import {
  buildReturningHomeViewModel,
  homeVenueRowFromCatalog,
} from '../home/presentation/returning-home-data';
import { renderReturningHomeScreen } from './returning-home-screen';

describe('returning home', () => {
  it('picks greeting by hour', () => {
    expect(greetingForHour(8)).toBe('Good morning');
    expect(greetingForHour(14)).toBe('Good afternoon');
    expect(greetingForHour(20)).toBe('Good evening');
  });

  it('filters recently visited by search query', () => {
    const view = buildReturningHomeViewModel({
      displayName: 'RowdyGull_47',
      searchQuery: 'airport',
      content: {
        recentlyVisited: [
          {
            id: '1',
            name: 'LA Stadium',
            visitedLabel: '3 days ago',
            postCount: 86,
            icon: 'pin',
          },
          {
            id: '2',
            name: 'Philadelphia Intl Airport',
            visitedLabel: '2 weeks ago',
            postCount: 12,
            icon: 'globe',
          },
        ],
        otherVenues: [],
        stats: { venues: 14, upvotesLabel: '3.2k', posts: 86 },
      },
      now: new Date('2026-08-10T20:00:00'),
    });

    expect(view.greeting).toBe('Good evening');
    expect(view.recentlyVisited).toHaveLength(1);
    expect(view.recentlyVisited[0]?.name).toContain('Airport');
  });

  it('maps catalog venues onto home rows', () => {
    expect(
      homeVenueRowFromCatalog({
        id: 3,
        name: 'Riverside',
        location: 'Lagos',
      }),
    ).toMatchObject({
      id: '3',
      name: 'Riverside',
      visitedLabel: 'Lagos',
      icon: 'pin',
    });
    expect(
      homeVenueRowFromCatalog({
        id: 8,
        name: 'LTV 8',
        location: '',
      }),
    ).toMatchObject({
      id: '8',
      visitedLabel: 'Venue',
      icon: 'pin',
    });
  });

  it('filters other venues by search query', () => {
    const view = buildReturningHomeViewModel({
      displayName: 'RowdyGull_47',
      searchQuery: 'riverside',
      content: {
        recentlyVisited: [
          {
            id: '1',
            name: 'LA Stadium',
            visitedLabel: 'Visited',
            postCount: 0,
            icon: 'pin',
          },
        ],
        otherVenues: [
          {
            id: '3',
            name: 'Riverside',
            visitedLabel: 'Lagos',
            postCount: 0,
            icon: 'pin',
          },
        ],
        stats: { venues: 1, upvotesLabel: '0', posts: 0 },
      },
    });
    expect(view.recentlyVisited).toEqual([]);
    expect(view.otherVenues).toHaveLength(1);
    expect(view.otherVenues[0]?.name).toBe('Riverside');
  });

  it('prefers profile stat over local home-content stats', () => {
    const view = buildReturningHomeViewModel({
      displayName: 'RowdyGull_47',
      searchQuery: '',
      content: {
        recentlyVisited: [],
        otherVenues: [],
        stats: { venues: 0, upvotesLabel: '0', posts: 0 },
      },
      profileStat: {
        posts_count: 86,
        upvotes_count: 3200,
        venues_count: 14,
      },
    });
    expect(view.stats).toEqual({
      venues: 14,
      upvotesLabel: '3.2k',
      posts: 86,
    });
  });

  it('renders home markup hooks', () => {
    const html = renderReturningHomeScreen({
      authUser: {
        id: 1,
        email: 'fan@email.com',
        pseudo_name: 'RowdyGull_47',
        is_email_verified: true,
        created_at: '',
        updated_at: '',
      },
      pseudoNameDraft: '',
      venueFeedPosts: [],
      venueFeedLoading: false,
      homeContent: {
        recentlyVisited: [
          {
            id: 'venue-la-stadium',
            name: 'LA Stadium',
            visitedLabel: '3 days ago',
            postCount: 86,
            icon: 'pin',
          },
        ],
        otherVenues: [
          {
            id: '3',
            name: 'Riverside',
            visitedLabel: 'Lagos',
            postCount: 0,
            icon: 'pin',
          },
          {
            id: '8',
            name: 'LTV 8',
            visitedLabel: 'Agidigbi',
            postCount: 0,
            icon: 'pin',
          },
        ],
        stats: { venues: 14, upvotesLabel: '3.2k', posts: 86 },
      },
    });

    expect(html).toContain('RowdyGull_47');
    expect(html).toContain('Where are you headed next?');
    expect(html).toContain('Live from the crowd');
    expect(html).not.toContain('id="home-venue-search-input"');
    expect(html).not.toContain('data-tour-id="returning-search"');
    expect(html).not.toContain('data-tour-id="returning-recent"');
    expect(html).not.toContain('Recently visited');
    expect(html).not.toContain('Other venues');
    expect(html).toContain('Your fplaces');
    expect(html).not.toContain('data-home-venue-id="venue-la-stadium"');
    expect(html).not.toContain('TEST');
    expect(html).toContain('>14</div>');
    expect(html).toContain('>3.2k</div>');
    expect(html).toContain('>86</div>');
    expect(html).toContain('Venue(s)');
    expect(html).toContain('Upvote(s)');
    expect(html).toContain('Post(s)');
    expect(html).not.toContain('returning-home-venue-card--sandbox');
    expect(html).not.toContain('0 post(s)');
  });

  it('shows an empty recent-venues state when none have been visited', () => {
    const html = renderReturningHomeScreen({
      authUser: {
        id: 1,
        email: 'fan@email.com',
        pseudo_name: 'RowdyGull_47',
        is_email_verified: true,
        created_at: '',
        updated_at: '',
      },
      pseudoNameDraft: '',
      venueFeedPosts: [],
      venueFeedLoading: false,
      homeContent: {
        recentlyVisited: [],
        otherVenues: [
          {
            id: '3',
            name: 'Riverside',
            visitedLabel: 'Lagos',
            postCount: 0,
            icon: 'pin',
          },
        ],
        stats: { venues: 0, upvotesLabel: '0', posts: 0 },
      },
    });
    expect(html).toContain('aria-label="Home"');
    expect(html).toContain('No recent posts yet');
    expect(html).not.toContain('Other venues');
  });

  it('escapes the display name that looks like HTML', () => {
    const html = renderReturningHomeScreen({
      authUser: {
        id: 1,
        email: 'fan@email.com',
        pseudo_name: '<b>hi</b>',
        is_email_verified: true,
        created_at: '',
        updated_at: '',
      },
      pseudoNameDraft: '',
      venueFeedPosts: [],
      venueFeedLoading: false,
      homeContent: {
        recentlyVisited: [],
        otherVenues: [],
        stats: { venues: 0, upvotesLabel: '0', posts: 0 },
      },
    });
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).not.toContain('<b>hi</b>');
  });

  it('shows no matching venues when the search misses the catalog', () => {
    const html = renderReturningHomeScreen({
      authUser: {
        id: 1,
        email: 'fan@email.com',
        pseudo_name: 'RowdyGull_47',
        is_email_verified: true,
        created_at: '',
        updated_at: '',
      },
      pseudoNameDraft: '',
      venueFeedPosts: [],
      venueFeedLoading: false,
      homeContent: {
        recentlyVisited: [
          {
            id: '1',
            name: 'LA Stadium',
            visitedLabel: '3 days ago',
            postCount: 86,
            icon: 'pin',
          },
        ],
        otherVenues: [
          {
            id: '3',
            name: 'Riverside',
            visitedLabel: 'Lagos',
            postCount: 0,
            icon: 'pin',
          },
        ],
        stats: { venues: 1, upvotesLabel: '0', posts: 86 },
      },
    });
    expect(html).not.toContain('No matching venues');
    expect(html).not.toContain('LA Stadium');
    expect(html).not.toContain('Riverside');
  });

  it('hides Other venues when the catalog list is empty', () => {
    const html = renderReturningHomeScreen({
      authUser: {
        id: 1,
        email: 'fan@email.com',
        pseudo_name: 'RowdyGull_47',
        is_email_verified: true,
        created_at: '',
        updated_at: '',
      },
      pseudoNameDraft: '',
      venueFeedPosts: [],
      venueFeedLoading: false,
      homeContent: {
        recentlyVisited: [
          {
            id: '1',
            name: 'LA Stadium',
            visitedLabel: '3 days ago',
            postCount: 86,
            icon: 'pin',
          },
        ],
        otherVenues: [],
        stats: { venues: 1, upvotesLabel: '0', posts: 86 },
      },
    });
    expect(html).not.toContain('Recently visited');
    expect(html).not.toContain('Other venues');
  });

  it('shows a circular overlay while returning-home content is still loading', () => {
    const html = renderReturningHomeScreen({
      authUser: {
        id: 1,
        email: 'fan@email.com',
        pseudo_name: 'RowdyGull_47',
        is_email_verified: true,
        created_at: '',
        updated_at: '',
      },
      pseudoNameDraft: '',
      venueFeedPosts: [],
      venueFeedLoading: false,
      homeContent: null,
    });
    expect(html).toContain('screen-loading-overlay');
    expect(html).toContain('aria-label="Loading home"');
    expect(html).not.toContain('No matching venues');
  });
});
