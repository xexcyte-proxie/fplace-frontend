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
} from '../entities';

export interface ForumRepository {
  listVenues(page?: number): Promise<PaginatedList<ForumVenue>>;
  listSections(venueId: number, page?: number): Promise<PaginatedList<ForumSection>>;
  listCategories(page?: number): Promise<PaginatedList<ForumCategory>>;
  listPosts(params: ListPostsParams): Promise<PaginatedList<ForumPost>>;
  /** POST /api/forum/posts/ — broadcasts `new_post` (+ `section_heat_update` when section set). */
  createPost(payload: CreatePostPayload): Promise<ForumPost>;
  /** POST /api/forum/posts/<id>/upvote/ — idempotent toggle; broadcasts `upvote_update`. */
  toggleUpvote(
    postId: number,
    options?: { hasUpvotedFallback?: boolean },
  ): Promise<ForumPost>;
  /** POST /api/forum/posts/<id>/flag/ — at 3 unique flags, backend may hide + broadcast `post_hidden`. */
  flagPost(postId: number, payload?: FlagPostPayload): Promise<ForumPost>;
  /**
   * Receive-only WebSocket to the venue room.
   * Call immediately after the initial REST feed fetch.
   */
  subscribeVenueLive(
    venueId: number,
    onEvent: VenueLiveEventHandler,
    onStatus?: VenueLiveStatusHandler,
  ): VenueLiveSubscription;
}
