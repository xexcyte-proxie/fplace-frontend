import type {
  CreateCommentPayload,
  CreatePostPayload,
  FlagPostPayload,
  ForumCategory,
  ForumComment,
  ForumPost,
  ForumSection,
  ForumVenue,
  ListCommentsParams,
  ListPostsParams,
  PaginatedList,
  UpdateCommentPayload,
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
  listPosts(params: ListPostsParams): Promise<PaginatedList<ForumPost>>;
  getPost(postId: number): Promise<ForumPost>;
  /** POST /api/forum/posts/ — broadcasts `new_post` (+ `section_heat_update` when section set). */
  createPost(payload: CreatePostPayload): Promise<ForumPost>;
  updatePost(postId: number, payload: UpdatePostPayload): Promise<ForumPost>;
  replacePost(postId: number, payload: CreatePostPayload): Promise<ForumPost>;
  deletePost(postId: number): Promise<void>;
  restorePost(postId: number): Promise<ForumPost>;
  /** POST /api/forum/posts/<id>/upvote/ — idempotent toggle; broadcasts `upvote_update`. */
  toggleUpvote(
    postId: number,
    options?: { hasUpvotedFallback?: boolean },
  ): Promise<ForumPost>;
  /** POST /api/forum/posts/<id>/flag/ — at 3 unique flags, backend may hide + broadcast `post_hidden`. */
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
