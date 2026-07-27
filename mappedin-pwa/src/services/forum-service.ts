/**
 * Forum service façade — presentation and MapApp talk to this module only.
 * HTTP + venue-room WebSocket live behind the forum repository (clean architecture).
 */
import type {
  CreatePostPayload,
  FlagPostPayload,
  ForumCategory,
  ForumPost,
  ForumSection,
  ForumVenue,
  ListPostsParams,
  PaginatedList,
  VenueLiveEventHandler,
  VenueLiveStatusHandler,
  VenueLiveSubscription,
} from '../forum/domain/entities';
import { forumRepository } from '../forum/data/forum-repository-impl';

export type {
  CreatePostPayload,
  FlagPostPayload,
  ForumCategory,
  ForumPost,
  ForumSection,
  ForumVenue,
  ListPostsParams,
  PaginatedList,
  SectionHeatEntry,
  VenueLiveEvent,
  VenueLiveSubscription,
  VenueLiveConnectionStatus,
  VenueLiveStatusHandler,
} from '../forum/domain/entities';

/** Fetch every page of a paginated list (venues/sections/categories are small). */
async function collectAllPages<T>(
  fetchPage: (page: number) => Promise<PaginatedList<T>>,
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  for (;;) {
    const response = await fetchPage(page);
    items.push(...response.results);
    if (!response.next) break;
    page += 1;
    if (page > 50) break;
  }
  return items;
}

export async function listAllVenues(): Promise<ForumVenue[]> {
  return collectAllPages((page) => forumRepository.listVenues(page));
}

export async function listAllSections(venueId: number): Promise<ForumSection[]> {
  return collectAllPages((page) => forumRepository.listSections(venueId, page));
}

export async function listAllCategories(): Promise<ForumCategory[]> {
  const categories = await collectAllPages((page) =>
    forumRepository.listCategories(page),
  );
  return categories
    .filter((category) => category.is_active)
    .sort((a, b) => a.order - b.order);
}

export async function listVenuePosts(
  params: ListPostsParams,
): Promise<PaginatedList<ForumPost>> {
  return forumRepository.listPosts(params);
}

/**
 * Loads sections + categories for a selected venue (historical venue state).
 * Categories are global; sections are scoped by venue.
 */
export async function loadVenueCatalog(venueId: number): Promise<{
  sections: ForumSection[];
  categories: ForumCategory[];
}> {
  const [sections, categories] = await Promise.all([
    listAllSections(venueId),
    listAllCategories(),
  ]);
  return {
    sections: sections.filter((section) => section.is_active),
    categories,
  };
}

/** Initial paginated historical feed for a venue after onboarding selection. */
export async function loadInitialVenueFeed(
  venueId: number,
): Promise<PaginatedList<ForumPost>> {
  return listVenuePosts({ venue: venueId, latest: true, page: 1 });
}

/**
 * Open the receive-only venue WebSocket room.
 * Call immediately after `loadInitialVenueFeed`.
 */
export function subscribeVenueLiveFeed(
  venueId: number,
  onEvent: VenueLiveEventHandler,
  onStatus?: VenueLiveStatusHandler,
): VenueLiveSubscription {
  return forumRepository.subscribeVenueLive(venueId, onEvent, onStatus);
}

/** Create a post; backend also broadcasts `new_post` (+ heat update when section set). */
export function createForumPost(
  payload: CreatePostPayload,
): Promise<ForumPost> {
  return forumRepository.createPost(payload);
}

/** Idempotent upvote toggle; backend broadcasts `upvote_update`. */
export function toggleForumPostUpvote(
  postId: number,
  options?: { hasUpvotedFallback?: boolean },
): Promise<ForumPost> {
  return forumRepository.toggleUpvote(postId, options);
}

/** Flag a post; at 3 unique flags the backend may hide it (`post_hidden`). */
export function flagForumPost(
  postId: number,
  payload?: FlagPostPayload,
): Promise<ForumPost> {
  return forumRepository.flagPost(postId, payload);
}
