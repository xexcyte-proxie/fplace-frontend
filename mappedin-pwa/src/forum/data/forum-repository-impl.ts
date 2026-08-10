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
} from '../domain/entities';
import type { ForumRepository } from '../domain/repositories/forum-repository';
import { forumRemoteDatasource } from './datasources/forum-remote-datasource';
import { forumWsDatasource } from './datasources/forum-ws-datasource';

export class ForumRepositoryImpl implements ForumRepository {
  listVenues(page?: number): Promise<PaginatedList<ForumVenue>> {
    return forumRemoteDatasource.listVenues(page);
  }

  getVenue(venueId: number): Promise<ForumVenue> {
    return forumRemoteDatasource.getVenue(venueId);
  }

  listSections(
    venueId: number,
    page?: number,
  ): Promise<PaginatedList<ForumSection>> {
    return forumRemoteDatasource.listSections(venueId, page);
  }

  getSection(sectionId: number): Promise<ForumSection> {
    return forumRemoteDatasource.getSection(sectionId);
  }

  listCategories(page?: number): Promise<PaginatedList<ForumCategory>> {
    return forumRemoteDatasource.listCategories(page);
  }

  getCategory(categoryId: number): Promise<ForumCategory> {
    return forumRemoteDatasource.getCategory(categoryId);
  }

  listPosts(params: ListPostsParams): Promise<PaginatedList<ForumPost>> {
    return forumRemoteDatasource.listPosts(params);
  }

  getPost(postId: number): Promise<ForumPost> {
    return forumRemoteDatasource.getPost(postId);
  }

  createPost(payload: CreatePostPayload): Promise<ForumPost> {
    return forumRemoteDatasource.createPost(payload);
  }

  updatePost(postId: number, payload: UpdatePostPayload): Promise<ForumPost> {
    return forumRemoteDatasource.updatePost(postId, payload);
  }

  replacePost(postId: number, payload: CreatePostPayload): Promise<ForumPost> {
    return forumRemoteDatasource.replacePost(postId, payload);
  }

  deletePost(postId: number): Promise<void> {
    return forumRemoteDatasource.deletePost(postId);
  }

  restorePost(postId: number): Promise<ForumPost> {
    return forumRemoteDatasource.restorePost(postId);
  }

  toggleUpvote(
    postId: number,
    options?: { hasUpvotedFallback?: boolean },
  ): Promise<ForumPost> {
    return forumRemoteDatasource.toggleUpvote(postId, options);
  }

  flagPost(postId: number, payload?: FlagPostPayload): Promise<ForumPost> {
    return forumRemoteDatasource.flagPost(postId, payload);
  }

  listComments(
    params?: ListCommentsParams,
  ): Promise<PaginatedList<ForumComment>> {
    return forumRemoteDatasource.listComments(params);
  }

  getComment(commentId: number): Promise<ForumComment> {
    return forumRemoteDatasource.getComment(commentId);
  }

  createComment(payload: CreateCommentPayload): Promise<ForumComment> {
    return forumRemoteDatasource.createComment(payload);
  }

  updateComment(
    commentId: number,
    payload: UpdateCommentPayload,
  ): Promise<ForumComment> {
    return forumRemoteDatasource.updateComment(commentId, payload);
  }

  replaceComment(
    commentId: number,
    payload: CreateCommentPayload,
  ): Promise<ForumComment> {
    return forumRemoteDatasource.replaceComment(commentId, payload);
  }

  deleteComment(commentId: number): Promise<void> {
    return forumRemoteDatasource.deleteComment(commentId);
  }

  restoreComment(commentId: number): Promise<ForumComment> {
    return forumRemoteDatasource.restoreComment(commentId);
  }

  subscribeVenueLive(
    venueId: number,
    onEvent: VenueLiveEventHandler,
    onStatus?: VenueLiveStatusHandler,
  ): VenueLiveSubscription {
    return forumWsDatasource.connect(venueId, onEvent, onStatus);
  }
}

export const forumRepository = new ForumRepositoryImpl();
