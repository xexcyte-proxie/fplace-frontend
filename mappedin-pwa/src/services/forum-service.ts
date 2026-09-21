/**
 * Forum service façade - presentation and MapApp talk to this module only.
 * HTTP + venue/location WebSocket live behind the forum repository.
 */
import type {
  CreateCommentPayload,
  CreateLocationMessagePayload,
  CreatePostPayload,
  FlagPostPayload,
  ForumCategory,
  ForumComment,
  ForumPost,
  ForumSection,
  ForumVenue,
  ListCommentsParams,
  ListLocationMessagesParams,
  ListPostsParams,
  LocationLiveEventHandler,
  LocationLiveStatusHandler,
  LocationLiveSubscription,
  LocationMessage,
  PaginatedList,
  UpdateCommentPayload,
  UpdateLocationMessagePayload,
  UpdatePostPayload,
  VenueLiveEventHandler,
  VenueLiveStatusHandler,
  VenueLiveSubscription,
} from "../forum/domain/entities";
import { forumRepository } from "../forum/data/forum-repository-impl";
import {
  mergeLocationMessageLists,
  sortLocationMessagesNewestFirst,
} from "../forum/domain/apply-location-live-event";
import { activeInterestLabels } from "../forum/domain/interest-catalog";

export { applyVenueLiveEvent } from "../forum/domain/apply-venue-live-event";
export { applyLocationLiveEvent } from "../forum/domain/apply-location-live-event";
export {
  conversationLocationIdsForSections,
  forumPostMatchesLocation,
  sectionIdForLocation,
} from "../forum/domain/section-locations";
export {
  FORUM_POST_CONTENT_MAX_LENGTH,
  LOCATION_MESSAGE_CONTENT_MAX_LENGTH,
} from "../forum/domain/entities";

export type {
  CreateCommentPayload,
  CreateLocationMessagePayload,
  CreatePostPayload,
  FlagPostPayload,
  ForumCategory,
  ForumComment,
  ForumPost,
  ForumSection,
  ForumVenue,
  ListCommentsParams,
  ListLocationMessagesParams,
  ListPostsParams,
  PaginatedList,
  SectionHeatEntry,
  LocationLiveEvent,
  LocationLiveSubscription,
  LocationMessage,
  UpdateCommentPayload,
  UpdateLocationMessagePayload,
  UpdatePostPayload,
  VenueLiveEvent,
  VenueLiveSubscription,
  VenueLiveConnectionStatus,
  VenueLiveStatusHandler,
} from "../forum/domain/entities";

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

export async function getForumVenue(venueId: number): Promise<ForumVenue> {
  return forumRepository.getVenue(venueId);
}

export async function listAllSections(
  venueId: number,
): Promise<ForumSection[]> {
  return collectAllPages((page) => forumRepository.listSections(venueId, page));
}

export async function getForumSection(
  sectionId: number,
): Promise<ForumSection> {
  return forumRepository.getSection(sectionId);
}

export async function listAllCategories(): Promise<ForumCategory[]> {
  const categories = await collectAllPages((page) =>
    forumRepository.listCategories(page),
  );
  return categories
    .filter((category) => category.is_active)
    .sort((a, b) => a.order - b.order);
}

export async function getForumCategory(
  categoryId: number,
): Promise<ForumCategory> {
  return forumRepository.getCategory(categoryId);
}

/** Active interest names for onboarding / profile chips. */
export async function listActiveInterestNames(): Promise<string[]> {
  const interests = await collectAllPages((page) =>
    forumRepository.listInterests(page),
  );
  return activeInterestLabels(interests);
}

export async function listVenuePosts(
  params: ListPostsParams,
): Promise<PaginatedList<ForumPost>> {
  return forumRepository.listPosts(params);
}

export async function getForumPost(postId: number): Promise<ForumPost> {
  return forumRepository.getPost(postId);
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

/** Conversation thread for one map location (find-or-create channel on POST). */
export async function loadLocationConversation(
  venueId: number,
  locationId: string,
): Promise<PaginatedList<LocationMessage>> {
  const page = await listLocationMessages({
    venue: venueId,
    location_id: locationId,
    page: 1,
    ordering: "-created_at",
  });
  return {
    ...page,
    results: sortLocationMessagesNewestFirst(page.results),
  };
}

export interface VenueConversationsPage {
  results: LocationMessage[];
  count: number;
  nextByLocation: Map<string, number>;
}

function nextPageFromUrl(nextUrl: string | null): number | null {
  if (!nextUrl) return null;
  const match = /[?&]page=(\d+)/.exec(nextUrl);
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isFinite(page) && page >= 2 ? page : null;
}

async function listLocationMessagesPage(
  venueId: number,
  locationId: string,
  page: number,
): Promise<PaginatedList<LocationMessage>> {
  try {
    return await listLocationMessages({
      venue: venueId,
      location_id: locationId,
      page,
      ordering: "-created_at",
    });
  } catch {
    return { count: 0, next: null, previous: null, results: [] };
  }
}

/**
 * Newest messages across every section conversation. The backend lists by
 * `(venue, location_id)`, so All fans out one request per section.
 */
export async function loadAllVenueConversations(
  venueId: number,
  locationIds: readonly string[],
  pageByLocation?: ReadonlyMap<string, number>,
): Promise<VenueConversationsPage> {
  if (!locationIds.length) {
    return { results: [], count: 0, nextByLocation: new Map() };
  }
  const pages = await Promise.all(
    locationIds.map(async (locationId) => {
      const page = pageByLocation?.get(locationId) ?? 1;
      const listed = await listLocationMessagesPage(venueId, locationId, page);
      return { locationId, listed };
    }),
  );
  const nextByLocation = new Map<string, number>();
  let count = 0;
  for (const entry of pages) {
    count += entry.listed.count;
    const nextPage = nextPageFromUrl(entry.listed.next);
    if (nextPage != null) nextByLocation.set(entry.locationId, nextPage);
  }
  return {
    results: mergeLocationMessageLists(pages.map((entry) => entry.listed.results)),
    count,
    nextByLocation,
  };
}

export async function listLocationMessages(
  params: ListLocationMessagesParams,
): Promise<PaginatedList<LocationMessage>> {
  const page = await forumRepository.listLocationMessages(params);
  return {
    ...page,
    results: sortLocationMessagesNewestFirst(page.results),
  };
}

export function getLocationMessage(messageId: number): Promise<LocationMessage> {
  return forumRepository.getLocationMessage(messageId);
}

export function createLocationMessage(
  payload: CreateLocationMessagePayload,
): Promise<LocationMessage> {
  return forumRepository.createLocationMessage(payload);
}

export function updateLocationMessage(
  messageId: number,
  payload: UpdateLocationMessagePayload,
): Promise<LocationMessage> {
  return forumRepository.updateLocationMessage(messageId, payload);
}

export function replaceLocationMessage(
  messageId: number,
  payload: UpdateLocationMessagePayload,
): Promise<LocationMessage> {
  return forumRepository.replaceLocationMessage(messageId, payload);
}

export function deleteLocationMessage(messageId: number): Promise<void> {
  return forumRepository.deleteLocationMessage(messageId);
}

export function restoreLocationMessage(
  messageId: number,
): Promise<LocationMessage> {
  return forumRepository.restoreLocationMessage(messageId);
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

/**
 * Open the receive-only location conversation WebSocket room.
 * Call immediately after `loadLocationConversation`.
 */
export function subscribeLocationLiveFeed(
  venueId: number,
  locationId: string,
  onEvent: LocationLiveEventHandler,
  onStatus?: LocationLiveStatusHandler,
): LocationLiveSubscription {
  return forumRepository.subscribeLocationLive(
    venueId,
    locationId,
    onEvent,
    onStatus,
  );
}

/** Create a post; backend also broadcasts `new_post` (+ heat update when section set). */
export function createForumPost(
  payload: CreatePostPayload,
): Promise<ForumPost> {
  return forumRepository.createPost(payload);
}

export function updateForumPost(
  postId: number,
  payload: UpdatePostPayload,
): Promise<ForumPost> {
  return forumRepository.updatePost(postId, payload);
}

export function replaceForumPost(
  postId: number,
  payload: CreatePostPayload,
): Promise<ForumPost> {
  return forumRepository.replacePost(postId, payload);
}

export function deleteForumPost(postId: number): Promise<void> {
  return forumRepository.deletePost(postId);
}

export function restoreForumPost(postId: number): Promise<ForumPost> {
  return forumRepository.restorePost(postId);
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

export function listForumComments(
  params?: ListCommentsParams,
): Promise<PaginatedList<ForumComment>> {
  return forumRepository.listComments(params);
}

/**
 * Fetch authoritative comment counts for a set of posts.
 * The post payload carries no comment count, so we read the paginated
 * `count` from the comments endpoint (one lightweight request per post).
 * Posts whose count request fails are omitted from the result.
 */
export async function loadForumCommentCounts(
  postIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  const entries = await Promise.all(
    postIds.map(async (postId) => {
      try {
        const page = await forumRepository.listComments({
          post: postId,
          page: 1,
        });
        return [postId, page.count] as const;
      } catch {
        return null;
      }
    }),
  );
  for (const entry of entries) {
    if (entry) counts.set(entry[0], entry[1]);
  }
  return counts;
}

export function getForumComment(commentId: number): Promise<ForumComment> {
  return forumRepository.getComment(commentId);
}

export function createForumComment(
  payload: CreateCommentPayload,
): Promise<ForumComment> {
  return forumRepository.createComment(payload);
}

export function updateForumComment(
  commentId: number,
  payload: UpdateCommentPayload,
): Promise<ForumComment> {
  return forumRepository.updateComment(commentId, payload);
}

export function replaceForumComment(
  commentId: number,
  payload: CreateCommentPayload,
): Promise<ForumComment> {
  return forumRepository.replaceComment(commentId, payload);
}

export function deleteForumComment(commentId: number): Promise<void> {
  return forumRepository.deleteComment(commentId);
}

export function restoreForumComment(commentId: number): Promise<ForumComment> {
  return forumRepository.restoreComment(commentId);
}
