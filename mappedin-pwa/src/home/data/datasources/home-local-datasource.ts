import type { ReturningHomeContent } from '../../domain/entities';

/**
 * Local/demo home content matching the returning-user Figma frame.
 * Swap for a remote datasource when the API exists.
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
      stats: {
        venues: 14,
        upvotesLabel: '3.2k',
        posts: 86,
      },
    };
  }
}

export const homeLocalDatasource = new HomeLocalDatasource();
