import type { SocialCategory, SocialPost } from '../types';

export const SOCIAL_VENUE = {
  name: 'LA Stadium',
  viewerCount: 1204,
} as const;

export const SOCIAL_CATEGORIES: Array<{
  id: SocialCategory;
  label: string;
  dotColor?: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'lines', label: 'Lines & Crowds', dotColor: '#3b82f6' },
  { id: 'food', label: 'Food & Drinks', dotColor: '#f97316' },
  { id: 'vibe', label: 'Fan Vibe', dotColor: '#ef4444' },
];

export const SOCIAL_LOCATIONS = [
  { id: 'section-114', label: 'Section 114', postCount: 38, countColor: '#ef4444' },
  { id: 'section-118', label: 'Section 118', postCount: 52, countColor: '#ef4444' },
  { id: 'section-104', label: 'Section 104', postCount: 18, countColor: '#ef4444' },
  { id: 'food-court', label: 'Food Court', postCount: 22, countColor: '#f97316' },
  { id: 'gate-a', label: 'Gate A', postCount: 4, countColor: '#8e8e93' },
] as const;

export const SOCIAL_QUICK_TAGS = [
  { id: 'atmosphere', label: 'Great atmosphere' },
  { id: 'long-line', label: '⌛ Long line here' },
  { id: 'goal', label: '⚽ Goal!!' },
] as const;

export const SOCIAL_QUICK_TAG_LABELS: Record<string, string> = Object.fromEntries(
  SOCIAL_QUICK_TAGS.map((tag) => [tag.id, tag.label]),
);

export const SOCIAL_LOCATIONS_BY_ID = Object.fromEntries(
  SOCIAL_LOCATIONS.map((location) => [location.id, location]),
);

export const SOCIAL_CATEGORY_LABELS: Record<
  Exclude<import('../types').SocialCategory, 'all'>,
  string
> = {
  lines: 'Lines & Crowds',
  food: 'Food & Drinks',
  vibe: 'Fan Vibe',
};

export const INITIAL_SOCIAL_POSTS: SocialPost[] = [
  {
    id: 'post-1',
    author: 'JagTifosi',
    initials: 'JT',
    avatarColor: '#ef4444',
    location: 'Section 114',
    locationId: 'section-114',
    timeAgo: '2m ago',
    category: 'vibe',
    categoryLabel: 'Fan Vibe',
    content: 'Atmosphere in 114 right now is unreal',
    upvotes: 47,
    comments: 6,
  },
  {
    id: 'post-2',
    author: 'MapleNine',
    initials: 'M9',
    avatarColor: '#3b82f6',
    location: 'Gate A',
    locationId: 'gate-a',
    timeAgo: '4m ago',
    category: 'lines',
    categoryLabel: 'Lines & Crowds',
    content: 'Long line at Gate A, moving slow. Gate C looks clearer.',
    upvotes: 22,
    comments: 2,
  },
  {
    id: 'post-3',
    author: 'RedKestrel',
    initials: 'RK',
    avatarColor: '#f97316',
    location: 'Food Court',
    locationId: 'food-court',
    timeAgo: '8m ago',
    category: 'food',
    categoryLabel: 'Food & Drinks',
    content: 'Free samples at the popcorn stand near Food Court',
    upvotes: 31,
    comments: 4,
  },
];

export function filterSocialPosts(
  posts: SocialPost[],
  category: SocialCategory,
  locationId: string | null,
): SocialPost[] {
  return posts.filter((post) => {
    if (category !== 'all' && post.category !== category) return false;
    if (locationId && post.locationId !== locationId) return false;
    return true;
  });
}
