import {
  greetingForHour,
  type HomeStats,
  type RecentVenueVisit,
  type ReturningHomeContent,
} from '../domain/entities';

export interface ReturningHomeViewModel {
  greeting: string;
  displayName: string;
  prompt: string;
  searchQuery: string;
  recentlyVisited: RecentVenueVisit[];
  stats: HomeStats;
}

export function buildReturningHomeViewModel(options: {
  displayName: string;
  searchQuery: string;
  content: ReturningHomeContent;
  now?: Date;
}): ReturningHomeViewModel {
  const now = options.now ?? new Date();
  const query = options.searchQuery.trim().toLowerCase();
  const recentlyVisited = query
    ? options.content.recentlyVisited.filter((venue) =>
        venue.name.toLowerCase().includes(query),
      )
    : options.content.recentlyVisited;

  return {
    greeting: greetingForHour(now.getHours()),
    displayName: options.displayName,
    prompt: 'Where are you headed next?',
    searchQuery: options.searchQuery,
    recentlyVisited,
    stats: options.content.stats,
  };
}
