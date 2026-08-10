import { describe, expect, it } from 'vitest';

import { greetingForHour } from '../home/domain/entities';
import { buildReturningHomeViewModel } from '../home/presentation/returning-home-data';
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
        stats: { venues: 14, upvotesLabel: '3.2k', posts: 86 },
      },
      now: new Date('2026-08-10T20:00:00'),
    });

    expect(view.greeting).toBe('Good evening');
    expect(view.recentlyVisited).toHaveLength(1);
    expect(view.recentlyVisited[0]?.name).toContain('Airport');
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
      homeVenueSearchQuery: '',
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
        stats: { venues: 14, upvotesLabel: '3.2k', posts: 86 },
      },
    });

    expect(html).toContain('RowdyGull_47');
    expect(html).toContain('Where are you headed next?');
    expect(html).toContain('id="home-venue-search-input"');
    expect(html).toContain('Recently visited');
    expect(html).toContain('Your fplaces');
    expect(html).toContain('data-home-venue-id="venue-la-stadium"');
  });
});
