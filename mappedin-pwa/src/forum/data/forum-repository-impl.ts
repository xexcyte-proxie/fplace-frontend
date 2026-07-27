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
} from '../domain/entities';
import type { ForumRepository } from '../domain/repositories/forum-repository';
import { forumRemoteDatasource } from './datasources/forum-remote-datasource';
import { forumWsDatasource } from './datasources/forum-ws-datasource';

export class ForumRepositoryImpl implements ForumRepository {
  listVenues(page?: number): Promise<PaginatedList<ForumVenue>> {
    return forumRemoteDatasource.listVenues(page);
  }

  listSections(
    venueId: number,
    page?: number,
  ): Promise<PaginatedList<ForumSection>> {
    return forumRemoteDatasource.listSections(venueId, page);
  }

  listCategories(page?: number): Promise<PaginatedList<ForumCategory>> {
    return forumRemoteDatasource.listCategories(page);
  }

  listPosts(params: ListPostsParams): Promise<PaginatedList<ForumPost>> {
    return forumRemoteDatasource.listPosts(params);
  }

  createPost(payload: CreatePostPayload): Promise<ForumPost> {
    return forumRemoteDatasource.createPost(payload);
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

  subscribeVenueLive(
    venueId: number,
    onEvent: VenueLiveEventHandler,
    onStatus?: VenueLiveStatusHandler,
  ): VenueLiveSubscription {
    return forumWsDatasource.connect(venueId, onEvent, onStatus);
  }
}

export const forumRepository = new ForumRepositoryImpl();
