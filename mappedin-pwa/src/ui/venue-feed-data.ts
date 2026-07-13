import type { VenueFeedFilter, VenueFeedPost } from '../types';

export const VENUE_FEED_VENUE = {
  name: 'LA Stadium',
  liveCount: 1204,
} as const;

export const VENUE_FEED_FILTERS: Array<{
  id: VenueFeedFilter;
  label: string;
  helpIcon?: boolean;
}> = [
  { id: 'all', label: 'All' },
  { id: 'hype', label: 'Hype' },
  { id: 'help', label: 'Help', helpIcon: true },
  { id: 'food', label: 'Food' },
];

export const VENUE_FEED_QUICK_REPLIES = [
  "Let's go!",
  'Defense!',
  'What a play',
] as const;

export const VENUE_FEED_EMERGENCY =
  'For medical or security emergencies, please contact stadium staff directly.';

export const INITIAL_VENUE_FEED_POSTS: VenueFeedPost[] = [
  {
    id: 'venue-post-1',
    author: 'BlueFalcon_09',
    initials: 'BF',
    avatarColor: '#8b63d4',
    location: 'Section 118',
    locationId: 'section-118',
    timeAgo: '2m ago',
    feedType: 'hype',
    content:
      'That goal just shook the whole north stand. Loudest I have ever heard this place get.',
    upvotes: 248,
    comments: 31,
  },
  {
    id: 'venue-post-2',
    author: 'QuietPelican',
    initials: 'QP',
    avatarColor: '#34a853',
    location: 'Section 104',
    locationId: 'section-104',
    timeAgo: '5m ago',
    feedType: 'help',
    content:
      'Any shorter line for water near 104? The main stand is packed right now.',
    upvotes: 12,
    comments: 8,
    helpCard: true,
  },
];

export function filterVenueFeedPosts(
  posts: VenueFeedPost[],
  filter: VenueFeedFilter,
  locationId: string | null,
): VenueFeedPost[] {
  return posts.filter((post) => {
    if (filter !== 'all' && post.feedType !== filter) return false;
    if (locationId && post.locationId !== locationId) return false;
    return true;
  });
}

export function venuePostsForLocation(
  posts: VenueFeedPost[],
  locationId: string,
): VenueFeedPost[] {
  const matched = posts.filter((post) => post.locationId === locationId);
  return matched.length ? matched : posts;
}
