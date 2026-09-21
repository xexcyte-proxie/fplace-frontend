import {
  greetingForHour,
  type HomeStats,
  type RecentVenueVisit,
  type ReturningHomeContent,
} from '../domain/entities';
import type { UserStat } from '../../auth/domain/entities';
import { homeStatsFromUserStat } from '../../auth/domain/user-stats';
import type { ForumVenueSummary } from '../../types';

export interface ReturningHomeViewModel {
  greeting: string;
  displayName: string;
  prompt: string;
  searchQuery: string;
  recentlyVisited: RecentVenueVisit[];
  otherVenues: RecentVenueVisit[];
  stats: HomeStats;
}

function matchesQuery(name: string, query: string): boolean {
  if (!query) return true;
  return name.toLowerCase().includes(query);
}

export function homeVenueRowFromCatalog(
  venue: ForumVenueSummary,
): RecentVenueVisit {
  const place = venue.location?.trim();
  return {
    id: String(venue.id),
    name: venue.name,
    visitedLabel: place || 'Venue',
    postCount: 0,
    icon: 'pin',
  };
}

export function buildReturningHomeViewModel(options: {
  displayName: string;
  searchQuery: string;
  content: ReturningHomeContent;
  profileStat?: UserStat | null;
  now?: Date;
}): ReturningHomeViewModel {
  const now = options.now ?? new Date();
  const query = options.searchQuery.trim().toLowerCase();
  const recentlyVisited = options.content.recentlyVisited.filter((venue) =>
    matchesQuery(venue.name, query),
  );
  const otherVenues = (options.content.otherVenues ?? []).filter((venue) =>
    matchesQuery(venue.name, query),
  );

  return {
    greeting: greetingForHour(now.getHours()),
    displayName: options.displayName,
    prompt: 'Where are you headed next?',
    searchQuery: options.searchQuery,
    recentlyVisited,
    otherVenues,
    stats: options.profileStat
      ? homeStatsFromUserStat(options.profileStat)
      : options.content.stats,
  };
}
