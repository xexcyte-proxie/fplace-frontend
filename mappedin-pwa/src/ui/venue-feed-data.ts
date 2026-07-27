import type { ForumPost } from '../forum/domain/entities';
import type {
  ForumCategorySummary,
  ForumSectionSummary,
  VenueFeedFilter,
  VenueFeedPost,
} from '../types';

export const VENUE_FEED_QUICK_REPLIES = [
  "Let's go!",
  'Defense!',
  'What a play',
] as const;

export const VENUE_FEED_EMERGENCY_FALLBACK =
  'For medical or security emergencies, please contact stadium staff directly.';

const AVATAR_COLORS = [
  '#8b63d4',
  '#34a853',
  '#3b5998',
  '#e67e22',
  '#16a085',
  '#c0392b',
  '#2980b9',
] as const;

export function filterVenueFeedPosts(
  posts: VenueFeedPost[],
  filter: VenueFeedFilter,
  locationId: string | null,
): VenueFeedPost[] {
  return posts.filter((post) => {
    if (filter !== 'all' && post.categoryId !== filter) return false;
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

export function categoryFiltersFromApi(
  categories: ForumCategorySummary[],
): Array<{ id: VenueFeedFilter; label: string; helpIcon?: boolean }> {
  return [
    { id: 'all', label: 'All' },
    ...categories.map((category) => ({
      id: String(category.id),
      label: category.name,
      helpIcon: category.slug === 'help',
    })),
  ];
}

export function helpDisclaimer(
  categories: ForumCategorySummary[],
  filter: VenueFeedFilter,
): string | null {
  const helpCategory = categories.find((item) => item.slug === 'help');
  if (filter === 'all') {
    return helpCategory?.disclaimer?.trim() || VENUE_FEED_EMERGENCY_FALLBACK;
  }
  const category = categories.find((item) => String(item.id) === filter);
  if (!category || category.slug !== 'help') return null;
  return category.disclaimer?.trim() || VENUE_FEED_EMERGENCY_FALLBACK;
}

export function mapForumPostsToVenueFeed(
  posts: ForumPost[],
  sections: ForumSectionSummary[],
  categories: ForumCategorySummary[],
): VenueFeedPost[] {
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );

  return posts.map((post) =>
    mapForumPostToVenueFeed(post, sectionById, categoryById),
  );
}

export function mapForumPostToVenueFeed(
  post: ForumPost,
  sectionById: Map<number, ForumSectionSummary>,
  categoryById: Map<number, ForumCategorySummary>,
): VenueFeedPost {
  const author = post.user.display_name?.trim() || 'Guest';
  const category = categoryById.get(post.category);
  const section = post.section != null ? sectionById.get(post.section) : undefined;

  return {
    id: String(post.id),
    author,
    authorId: post.user.id,
    initials: initialsFromName(author),
    avatarColor: avatarColorForId(post.user.id),
    location: section?.name ?? 'Venue',
    locationId: post.section != null ? String(post.section) : '',
    timeAgo: formatTimeAgo(post.created_at),
    feedType: category?.slug ?? 'unknown',
    categoryId: String(post.category),
    content: post.content,
    upvotes: post.upvotes_count,
    comments: 0,
    helpCard: category?.slug === 'help',
    hasUpvoted: post.has_upvoted,
  };
}

/**
 * Approximate “fans live” from distinct posters in the loaded feed.
 * Post volume must not inflate this (one fan can post many times).
 * The current viewer counts as present when signed in.
 */
export function estimateFansLive(
  posts: VenueFeedPost[],
  currentUserId?: number | null,
): number {
  const authorIds = new Set<number>();
  for (const post of posts) {
    if (Number.isFinite(post.authorId)) {
      authorIds.add(post.authorId);
    }
  }
  if (currentUserId != null && Number.isFinite(currentUserId)) {
    authorIds.add(currentUserId);
  }
  return authorIds.size;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'F';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function avatarColorForId(id: number): string {
  return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
}

export function formatTimeAgo(iso: string): string {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
