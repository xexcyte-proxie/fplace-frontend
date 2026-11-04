/** Recently visited venue row on the returning-user home. */
export type RecentVenueIconKind = 'pin' | 'globe';

export interface RecentVenueVisit {
  id: string;
  name: string;
  /** Relative visit label, e.g. "3 days ago". */
  visitedLabel: string;
  postCount: number;
  icon: RecentVenueIconKind;
}

export interface HomeStats {
  venues: number;
  /** Pre-formatted upvote count, e.g. "3.2k". */
  upvotesLabel: string;
  posts: number;
}

export interface ReturningHomeContent {
  recentlyVisited: RecentVenueVisit[];
  otherVenues: RecentVenueVisit[];
  stats: HomeStats;
}

/** Which Navigate-home experience to show. */
export type HomeExperience = 'first-visit' | 'returning';

/**
 * Returning-app sessions (already visited this venue, or no venue yet) land on
 * Recently visited. First enter of a venue still uses the first-visit dashboard.
 */
export function resolveHomeExperience(
  venueId: string | null | undefined,
  hasVisitedVenue: boolean,
): HomeExperience {
  if (!venueId?.trim()) return 'returning';
  return hasVisitedVenue ? 'returning' : 'first-visit';
}

/** Category chip tone on the first-visit venue home feed. */
export type FirstVisitCategoryTone =
  | 'crowds'
  | 'food'
  | 'vibe'
  | 'help'
  | 'default';

export interface FirstVisitCrowdPost {
  id: string;
  author: string;
  initials: string;
  avatarColor: string;
  categoryLabel: string;
  categoryTone: FirstVisitCategoryTone;
  content: string;
  upvotes: number;
  comments: number;
  upvoted: boolean;
  /** False for location-conversation rows that have no post upvote API. */
  upvoteable: boolean;
}

export interface FirstVisitVenueHomeContent {
  venueName: string;
  sectionLabel: string;
  fansHereLabel: string;
  previewPosts: FirstVisitCrowdPost[];
}

/** Time-of-day greeting for the returning home header. */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatFansHereLabel(count: number): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return `${n.toLocaleString('en-US')} fan(s) here right now`;
}

export function countDistinctFans(
  posts: ReadonlyArray<{ authorId: number }>,
): number {
  return new Set(posts.map((post) => post.authorId)).size;
}

/** Map forum feed type / slug to the first-visit category chip. */
export function resolveFirstVisitCategory(feedType: string): {
  label: string;
  tone: FirstVisitCategoryTone;
} {
  const normalized = feedType.trim().toLowerCase();
  if (
    normalized.includes('crowd') ||
    normalized.includes('line') ||
    normalized === 'lines'
  ) {
    return { label: 'CROWDS', tone: 'crowds' };
  }
  if (normalized.includes('food') || normalized.includes('drink')) {
    return { label: 'FOOD', tone: 'food' };
  }
  if (normalized.includes('help')) {
    return { label: 'ALERTS', tone: 'help' };
  }
  if (normalized.includes('vibe') || normalized.includes('hype')) {
    return { label: 'VIBE', tone: 'vibe' };
  }
  const label = normalized
    ? normalized.replace(/[-_]/g, ' ').toUpperCase()
    : 'UPDATE';
  return { label, tone: 'default' };
}
