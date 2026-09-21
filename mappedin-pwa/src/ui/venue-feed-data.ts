import type { ForumPost, LocationMessage } from '../forum/domain/entities';
import {
  conversationLocationIdForSection,
  sectionIdForLocation,
  sectionMatchesConversationLocation,
} from '../forum/domain/section-locations';
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

export interface VenueFeedLocationScope {
  posts: VenueFeedPost[];
  /** True when the feed is a map-area conversation, not the venue-wide list. */
  scoped: boolean;
  sectionId: number | null;
  /** Display name for the scoped location (section name from the API). */
  sectionName: string | null;
}

/**
 * Scope the feed to a tapped map location. Location chat is keyed by the
 * Mappedin location id stored on conversation items (`locationId`).
 */
export function scopeVenueFeedPostsToLocation(
  posts: VenueFeedPost[],
  locationId: string | null,
  sections: ForumSectionSummary[],
): VenueFeedLocationScope {
  if (!locationId) {
    return { posts, scoped: false, sectionId: null, sectionName: null };
  }
  const sectionId = sectionIdForLocation(sections, locationId);
  return {
    posts: posts.filter((post) => post.locationId === locationId),
    scoped: true,
    sectionId,
    sectionName:
      sectionId != null
        ? sections.find((section) => section.id === sectionId)?.name ?? null
        : null,
  };
}

/**
 * Display name for a map-tapped conversation. Prefers the map card name
 * (also sent as `location_name` on create), then a matching forum section.
 */
export function resolveVenueFeedAreaName(
  scope: VenueFeedLocationScope,
  socialLocationName?: string | null,
): string | null {
  const mapName = socialLocationName?.trim();
  if (mapName) return mapName;
  const sectionName = scope.sectionName?.trim();
  return sectionName || null;
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

export interface VenueFeedSectionChip {
  /** Null is the venue-wide post feed. */
  locationId: string | null;
  label: string;
  active: boolean;
}

/**
 * Section switcher for the social tab. `All` lists every section conversation;
 * every other chip opens that section's location thread.
 */
export function venueFeedSectionChips(
  sections: ForumSectionSummary[],
  socialLocation: string | null,
): VenueFeedSectionChip[] {
  const activeSections = sections.filter((section) => section.is_active !== false);
  return [
    { locationId: null, label: 'All', active: !socialLocation },
    ...activeSections.map((section) => ({
      locationId: conversationLocationIdForSection(section),
      label: section.name,
      active: sectionMatchesConversationLocation(section, socialLocation),
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
  existing?: VenueFeedPost | null,
): VenueFeedPost {
  const author = post.user.display_name?.trim() || 'Guest';
  const category = categoryById.get(post.category);
  const section = post.section != null ? sectionById.get(post.section) : undefined;

  return {
    id: String(post.id),
    kind: 'post',
    author,
    authorId: post.user.id,
    initials: initialsFromName(author),
    avatarColor: avatarColorForId(post.user.id),
    location: section?.name ?? 'Venue',
    locationId: post.section != null ? String(post.section) : '',
    timeAgo: formatTimeAgo(post.created_at),
    createdAt: post.created_at,
    feedType: category?.slug ?? 'unknown',
    categoryId: String(post.category),
    content: post.content,
    upvotes: post.upvotes_count,
    comments: existing?.comments ?? 0,
    helpCard: category?.slug === 'help',
    hasUpvoted: post.has_upvoted,
  };
}

export function mapLocationMessagesToVenueFeed(
  messages: LocationMessage[],
): VenueFeedPost[] {
  return messages.map((message) => mapLocationMessageToVenueFeed(message));
}

export function mapLocationMessageToVenueFeed(
  message: LocationMessage,
): VenueFeedPost {
  const author = message.user.display_name?.trim() || 'Guest';
  const location = message.location_name.trim() || 'Location';

  return {
    id: String(message.id),
    kind: 'conversation',
    author,
    authorId: message.user.id,
    initials: initialsFromName(author),
    avatarColor: avatarColorForId(message.user.id),
    location,
    locationId: message.location_id,
    timeAgo: formatTimeAgo(message.created_at),
    createdAt: message.created_at,
    feedType: 'conversation',
    categoryId: '',
    content: message.content,
    upvotes: 0,
    comments: 0,
    helpCard: false,
    hasUpvoted: false,
  };
}

export function isConversationFeedItem(post: VenueFeedPost): boolean {
  return post.kind === 'conversation';
}

/**
 * Overlay authoritative comment counts (keyed by post id) onto feed posts.
 * Posts without a fetched count keep their current value.
 */
export function applyCommentCounts(
  posts: VenueFeedPost[],
  countsByPostId: ReadonlyMap<string, number>,
): VenueFeedPost[] {
  if (!countsByPostId.size) return posts;
  return posts.map((post) => {
    const count = countsByPostId.get(post.id);
    if (count == null || count === post.comments) return post;
    return { ...post, comments: count };
  });
}

/** Sentinel `next` URL while the All conversations view still has older pages. */
export const VENUE_ALL_CONVERSATIONS_NEXT = 'fplaces:all-conversations';

/**
 * Reads the DRF page number out of a paginated `next` URL.
 * Returns null when there is no next page (or the URL is malformed).
 */
export function nextFeedPageFromUrl(nextUrl: string | null): number | null {
  if (!nextUrl || nextUrl === VENUE_ALL_CONVERSATIONS_NEXT) return null;
  const match = /[?&]page=(\d+)/.exec(nextUrl);
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isFinite(page) && page >= 2 ? page : null;
}

/**
 * Appends an older page of posts to the feed, dropping any post already
 * present (live WebSocket events can race ahead of pagination).
 */
export function appendOlderVenueFeedPosts(
  existing: VenueFeedPost[],
  older: VenueFeedPost[],
): VenueFeedPost[] {
  const existingIds = new Set(existing.map((post) => post.id));
  const appended = older.filter((post) => !existingIds.has(post.id));
  return appended.length ? [...existing, ...appended] : existing;
}

/**
 * Fresh time-ago label at render time. Falls back to the label computed at
 * map time when the post has no ISO timestamp (e.g. older fixtures).
 */
export function venueFeedTimeAgo(post: VenueFeedPost): string {
  return post.createdAt ? formatTimeAgo(post.createdAt) : post.timeAgo;
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
