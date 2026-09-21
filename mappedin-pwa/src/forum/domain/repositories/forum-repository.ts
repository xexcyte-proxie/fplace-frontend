import type {
  CreateCommentPayload,
  CreateLocationMessagePayload,
  CreatePostPayload,
  FlagPostPayload,
  ForumCategory,
  ForumComment,
  ForumInterest,
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
} from '../entities';

export interface ForumRepository {
  listVenues(page?: number): Promise<PaginatedList<ForumVenue>>;
  getVenue(venueId: number): Promise<ForumVenue>;
  listSections(venueId: number, page?: number): Promise<PaginatedList<ForumSection>>;
  getSection(sectionId: number): Promise<ForumSection>;
  listCategories(page?: number): Promise<PaginatedList<ForumCategory>>;
  getCategory(categoryId: number): Promise<ForumCategory>;
  /** GET /api/forum/interests/?is_active=true — public catalog for profile pickers. */
  listInterests(page?: number): Promise<PaginatedList<ForumInterest>>;
  listPosts(params: ListPostsParams): Promise<PaginatedList<ForumPost>>;
  getPost(postId: number): Promise<ForumPost>;
  /** POST /api/forum/posts/ - broadcasts `new_post` (+ `section_heat_update` when section set). */
  createPost(payload: CreatePostPayload): Promise<ForumPost>;
  updatePost(postId: number, payload: UpdatePostPayload): Promise<ForumPost>;
  replacePost(postId: number, payload: CreatePostPayload): Promise<ForumPost>;
  deletePost(postId: number): Promise<void>;
  restorePost(postId: number): Promise<ForumPost>;
  /** POST /api/forum/posts/<id>/upvote/ - idempotent toggle; broadcasts `upvote_update`. */
  toggleUpvote(
    postId: number,
    options?: { hasUpvotedFallback?: boolean },
  ): Promise<ForumPost>;
  /** POST /api/forum/posts/<id>/flag/ - at 3 unique flags, backend may hide + broadcast `post_hidden`. */
  flagPost(postId: number, payload?: FlagPostPayload): Promise<ForumPost>;
  listComments(params?: ListCommentsParams): Promise<PaginatedList<ForumComment>>;
  getComment(commentId: number): Promise<ForumComment>;
  createComment(payload: CreateCommentPayload): Promise<ForumComment>;
  updateComment(
    commentId: number,
    payload: UpdateCommentPayload,
  ): Promise<ForumComment>;
  replaceComment(
    commentId: number,
    payload: CreateCommentPayload,
  ): Promise<ForumComment>;
  deleteComment(commentId: number): Promise<void>;
  restoreComment(commentId: number): Promise<ForumComment>;
  listLocationMessages(
    params: ListLocationMessagesParams,
  ): Promise<PaginatedList<LocationMessage>>;
  getLocationMessage(messageId: number): Promise<LocationMessage>;
  /** POST /api/forum/conversations/ - find-or-create; broadcasts `new_location_message`. */
  createLocationMessage(
    payload: CreateLocationMessagePayload,
  ): Promise<LocationMessage>;
  updateLocationMessage(
    messageId: number,
    payload: UpdateLocationMessagePayload,
  ): Promise<LocationMessage>;
  replaceLocationMessage(
    messageId: number,
    payload: UpdateLocationMessagePayload,
  ): Promise<LocationMessage>;
  deleteLocationMessage(messageId: number): Promise<void>;
  restoreLocationMessage(messageId: number): Promise<LocationMessage>;
  /**
   * Receive-only WebSocket to the venue room.
   * Call immediately after the initial REST feed fetch.
   */
  subscribeVenueLive(
    venueId: number,
    onEvent: VenueLiveEventHandler,
    onStatus?: VenueLiveStatusHandler,
  ): VenueLiveSubscription;
  /**
   * Receive-only WebSocket to a map-location conversation room.
   * Call after the initial REST conversation fetch.
   */
  subscribeLocationLive(
    venueId: number,
    locationId: string,
    onEvent: LocationLiveEventHandler,
    onStatus?: LocationLiveStatusHandler,
  ): LocationLiveSubscription;
}
