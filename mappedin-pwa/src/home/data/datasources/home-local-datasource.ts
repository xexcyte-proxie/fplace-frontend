import type { ReturningHomeContent } from '../../domain/entities';

/**
 * Local/demo home content for recently visited venues.
 * Profile stats come from GET /api/users/me/ (`stat`), not this datasource.
 */
export class HomeLocalDatasource {
  async fetchReturningHomeContent(): Promise<ReturningHomeContent> {
    return {
      recentlyVisited: [
        {
          id: 'venue-la-stadium',
          name: 'LA Stadium',
          visitedLabel: '3 days ago',
          postCount: 86,
          icon: 'pin',
        },
        {
          id: 'venue-phl-airport',
          name: 'Philadelphia Intl Airport',
          visitedLabel: '2 weeks ago',
          postCount: 12,
          icon: 'globe',
        },
      ],
      otherVenues: [],
      stats: {
        venues: 0,
        upvotesLabel: '0',
        posts: 0,
      },
    };
  }
}

export const homeLocalDatasource = new HomeLocalDatasource();
