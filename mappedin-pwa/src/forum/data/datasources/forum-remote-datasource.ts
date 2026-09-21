import { apiRequest } from '../../../auth/data/datasources/api-client';
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
  LocationMessage,
  PaginatedList,
  UpdateCommentPayload,
  UpdateLocationMessagePayload,
  UpdatePostPayload,
} from '../../domain/entities';
import {
  coerceForumPost,
  coerceForumPostList,
} from '../mappers/forum-post-mapper';
import {
  coerceForumComment,
  coerceForumCommentList,
} from '../mappers/forum-comment-mapper';
import { coerceForumInterestList } from '../mappers/forum-interest-mapper';
import {
  coerceForumSection,
  coerceForumSectionList,
} from '../mappers/forum-section-mapper';
import {
  coerceLocationMessage,
  coerceLocationMessageList,
} from '../mappers/location-message-mapper';

function withQuery(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function requireForumPost(
  raw: unknown,
  fallbackError: string,
  options?: { hasUpvotedFallback?: boolean },
): ForumPost {
  const post = coerceForumPost(raw, options);
  if (!post) {
    throw new Error(fallbackError);
  }
  return post;
}

function requireForumComment(
  raw: unknown,
  fallbackError: string,
): ForumComment {
  const comment = coerceForumComment(raw);
  if (!comment) {
    throw new Error(fallbackError);
  }
  return comment;
}

function requireLocationMessage(
  raw: unknown,
  fallbackError: string,
): LocationMessage {
  const message = coerceLocationMessage(raw);
  if (!message) {
    throw new Error(fallbackError);
  }
  return message;
}

function requireForumSection(
  raw: unknown,
  fallbackError: string,
): ForumSection {
  const section = coerceForumSection(raw);
  if (!section) {
    throw new Error(fallbackError);
  }
  return section;
}

export class ForumRemoteDatasource {
  listVenues(page = 1): Promise<PaginatedList<ForumVenue>> {
    return apiRequest<PaginatedList<ForumVenue>>(
      withQuery('/api/forum/venues/', { page }),
      {
        fallbackError: 'Could not load venues. Please try again.',
      },
    );
  }

  getVenue(venueId: number): Promise<ForumVenue> {
    return apiRequest<ForumVenue>(`/api/forum/venues/${venueId}/`, {
      fallbackError: 'Could not load that venue.',
    });
  }

  async listSections(
    venueId: number,
    page = 1,
  ): Promise<PaginatedList<ForumSection>> {
    const raw = await apiRequest<unknown>(
      withQuery('/api/forum/sections/', {
        venue: venueId,
        is_active: true,
        page,
      }),
      {
        fallbackError: 'Could not load sections for this venue.',
      },
    );
    return coerceForumSectionList(raw);
  }

  async getSection(sectionId: number): Promise<ForumSection> {
    const raw = await apiRequest<unknown>(
      `/api/forum/sections/${sectionId}/`,
      {
        fallbackError: 'Could not load that section.',
      },
    );
    return requireForumSection(raw, 'Could not load that section.');
  }

  listCategories(page = 1): Promise<PaginatedList<ForumCategory>> {
    return apiRequest<PaginatedList<ForumCategory>>(
      withQuery('/api/forum/categories/', {
        is_active: true,
        ordering: 'order',
        page,
      }),
      {
        fallbackError: 'Could not load categories. Please try again.',
      },
    );
  }

  getCategory(categoryId: number): Promise<ForumCategory> {
    return apiRequest<ForumCategory>(`/api/forum/categories/${categoryId}/`, {
      fallbackError: 'Could not load that category.',
    });
  }

  async listInterests(page = 1): Promise<PaginatedList<ForumInterest>> {
    const raw = await apiRequest<unknown>(
      withQuery('/api/forum/interests/', {
        is_active: true,
        ordering: 'order',
        page,
      }),
      {
        fallbackError: 'Could not load interests. Please try again.',
      },
    );
    return coerceForumInterestList(raw);
  }

  async listPosts(params: ListPostsParams): Promise<PaginatedList<ForumPost>> {
    const raw = await apiRequest<unknown>(
      withQuery('/api/forum/posts/', {
        venue: params.venue,
        category: params.category,
        section: params.section,
        page: params.page,
        latest: params.latest ?? true,
        status: params.status,
      }),
      {
        auth: true,
        fallbackError: 'Could not load the venue feed. Please try again.',
      },
    );
    return coerceForumPostList(raw);
  }

  async getPost(postId: number): Promise<ForumPost> {
    const raw = await apiRequest<unknown>(`/api/forum/posts/${postId}/`, {
      auth: true,
      fallbackError: 'Could not load that post.',
    });
    return requireForumPost(raw, 'Could not load that post.');
  }

  async createPost(payload: CreatePostPayload): Promise<ForumPost> {
    const body: Record<string, unknown> = {
      venue: payload.venue,
      category: payload.category,
      content: payload.content,
    };
    if (payload.section != null) {
      body.section = payload.section;
    }
    const raw = await apiRequest<unknown>('/api/forum/posts/', {
      method: 'POST',
      auth: true,
      body,
      fallbackError: 'Could not post. Please try again.',
    });
    return requireForumPost(raw, 'Could not post. Please try again.');
  }

  async updatePost(
    postId: number,
    payload: UpdatePostPayload,
  ): Promise<ForumPost> {
    const raw = await apiRequest<unknown>(`/api/forum/posts/${postId}/`, {
      method: 'PATCH',
      auth: true,
      body: payload,
      fallbackError: 'Could not update that post.',
    });
    return requireForumPost(raw, 'Could not update that post.');
  }

  async replacePost(
    postId: number,
    payload: CreatePostPayload,
  ): Promise<ForumPost> {
    const body: Record<string, unknown> = {
      venue: payload.venue,
      category: payload.category,
      content: payload.content,
    };
    if (payload.section != null) {
      body.section = payload.section;
    }
    const raw = await apiRequest<unknown>(`/api/forum/posts/${postId}/`, {
      method: 'PUT',
      auth: true,
      body,
      fallbackError: 'Could not replace that post.',
    });
    return requireForumPost(raw, 'Could not replace that post.');
  }

  async deletePost(postId: number): Promise<void> {
    await apiRequest(`/api/forum/posts/${postId}/`, {
      method: 'DELETE',
      auth: true,
      fallbackError: 'Could not delete that post.',
    });
  }

  async restorePost(postId: number): Promise<ForumPost> {
    const raw = await apiRequest<unknown>(
      `/api/forum/posts/${postId}/restore/`,
      {
        method: 'POST',
        auth: true,
        fallbackError: 'Could not restore that post.',
      },
    );
    return requireForumPost(raw, 'Could not restore that post.');
  }

  async toggleUpvote(
    postId: number,
    options?: { hasUpvotedFallback?: boolean },
  ): Promise<ForumPost> {
    const raw = await apiRequest<unknown>(`/api/forum/posts/${postId}/upvote/`, {
      method: 'POST',
      auth: true,
      fallbackError: 'Could not update upvote. Please try again.',
    });
    const coerced = coerceForumPost(raw, options);
    if (coerced) return coerced;

    if (raw && typeof raw === 'object') {
      const dto = raw as Record<string, unknown>;
      const nested =
        (dto.post && typeof dto.post === 'object'
          ? (dto.post as Record<string, unknown>)
          : null) ?? dto;
      const upvotesCount = Number(
        nested.upvotes_count ?? nested.upvotesCount,
      );
      const hasUpvotedRaw =
        nested.has_upvoted ?? nested.hasUpvoted ?? nested.upvoted;
      return {
        id: postId,
        user: { id: 0, display_name: 'Guest' },
        venue: 0,
        section: null,
        category: 0,
        content: '',
        upvotes_count: Number.isFinite(upvotesCount) ? upvotesCount : 0,
        flags_count: 0,
        status: 'visible',
        has_upvoted:
          typeof hasUpvotedRaw === 'boolean'
            ? hasUpvotedRaw
            : Boolean(options?.hasUpvotedFallback),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    throw new Error('Could not update upvote. Please try again.');
  }

  async flagPost(
    postId: number,
    payload: FlagPostPayload = {},
  ): Promise<ForumPost> {
    const body =
      payload.reason?.trim()
        ? { reason: payload.reason.trim().slice(0, 255) }
        : {};
    const raw = await apiRequest<unknown>(`/api/forum/posts/${postId}/flag/`, {
      method: 'POST',
      auth: true,
      body,
      fallbackError: 'Could not report this post. Please try again.',
    });
    return requireForumPost(raw, 'Could not report this post. Please try again.');
  }

  async listComments(
    params: ListCommentsParams = {},
  ): Promise<PaginatedList<ForumComment>> {
    const raw = await apiRequest<unknown>(
      withQuery('/api/forum/comments/', {
        post: params.post,
        page: params.page,
        ordering: params.ordering,
        created_after: params.created_after,
        created_before: params.created_before,
      }),
      {
        auth: true,
        fallbackError: 'Could not load comments.',
      },
    );
    return coerceForumCommentList(raw);
  }

  async getComment(commentId: number): Promise<ForumComment> {
    const raw = await apiRequest<unknown>(`/api/forum/comments/${commentId}/`, {
      auth: true,
      fallbackError: 'Could not load that comment.',
    });
    return requireForumComment(raw, 'Could not load that comment.');
  }

  async createComment(payload: CreateCommentPayload): Promise<ForumComment> {
    const raw = await apiRequest<unknown>('/api/forum/comments/', {
      method: 'POST',
      auth: true,
      body: payload,
      fallbackError: 'Could not post that comment.',
    });
    return requireForumComment(raw, 'Could not post that comment.');
  }

  async updateComment(
    commentId: number,
    payload: UpdateCommentPayload,
  ): Promise<ForumComment> {
    const raw = await apiRequest<unknown>(`/api/forum/comments/${commentId}/`, {
      method: 'PATCH',
      auth: true,
      body: payload,
      fallbackError: 'Could not update that comment.',
    });
    return requireForumComment(raw, 'Could not update that comment.');
  }

  async replaceComment(
    commentId: number,
    payload: CreateCommentPayload,
  ): Promise<ForumComment> {
    const raw = await apiRequest<unknown>(`/api/forum/comments/${commentId}/`, {
      method: 'PUT',
      auth: true,
      body: payload,
      fallbackError: 'Could not replace that comment.',
    });
    return requireForumComment(raw, 'Could not replace that comment.');
  }

  async deleteComment(commentId: number): Promise<void> {
    await apiRequest(`/api/forum/comments/${commentId}/`, {
      method: 'DELETE',
      auth: true,
      fallbackError: 'Could not delete that comment.',
    });
  }

  async restoreComment(commentId: number): Promise<ForumComment> {
    const raw = await apiRequest<unknown>(
      `/api/forum/comments/${commentId}/restore/`,
      {
        method: 'POST',
        auth: true,
        fallbackError: 'Could not restore that comment.',
      },
    );
    return requireForumComment(raw, 'Could not restore that comment.');
  }

  async listLocationMessages(
    params: ListLocationMessagesParams,
  ): Promise<PaginatedList<LocationMessage>> {
    const raw = await apiRequest<unknown>(
      withQuery('/api/forum/conversations/', {
        venue: params.venue,
        location_id: params.location_id,
        page: params.page,
        ordering: params.ordering,
        created_after: params.created_after,
        created_before: params.created_before,
      }),
      {
        auth: true,
        fallbackError: 'Could not load this conversation. Please try again.',
      },
    );
    return coerceLocationMessageList(raw);
  }

  async getLocationMessage(messageId: number): Promise<LocationMessage> {
    const raw = await apiRequest<unknown>(
      `/api/forum/conversations/${messageId}/`,
      {
        auth: true,
        fallbackError: 'Could not load that message.',
      },
    );
    return requireLocationMessage(raw, 'Could not load that message.');
  }

  async createLocationMessage(
    payload: CreateLocationMessagePayload,
  ): Promise<LocationMessage> {
    const locationName = payload.location_name?.trim();
    const raw = await apiRequest<unknown>('/api/forum/conversations/', {
      method: 'POST',
      auth: true,
      body: {
        venue: payload.venue,
        location_id: payload.location_id,
        content: payload.content,
        ...(locationName ? { location_name: locationName } : {}),
      },
      fallbackError: 'Could not send that message. Please try again.',
    });
    return requireLocationMessage(
      raw,
      'Could not send that message. Please try again.',
    );
  }

  async updateLocationMessage(
    messageId: number,
    payload: UpdateLocationMessagePayload,
  ): Promise<LocationMessage> {
    const raw = await apiRequest<unknown>(
      `/api/forum/conversations/${messageId}/`,
      {
        method: 'PATCH',
        auth: true,
        body: payload,
        fallbackError: 'Could not update that message.',
      },
    );
    return requireLocationMessage(raw, 'Could not update that message.');
  }

  async replaceLocationMessage(
    messageId: number,
    payload: UpdateLocationMessagePayload,
  ): Promise<LocationMessage> {
    const raw = await apiRequest<unknown>(
      `/api/forum/conversations/${messageId}/`,
      {
        method: 'PUT',
        auth: true,
        body: payload,
        fallbackError: 'Could not replace that message.',
      },
    );
    return requireLocationMessage(raw, 'Could not replace that message.');
  }

  async deleteLocationMessage(messageId: number): Promise<void> {
    await apiRequest(`/api/forum/conversations/${messageId}/`, {
      method: 'DELETE',
      auth: true,
      fallbackError: 'Could not delete that message.',
    });
  }

  async restoreLocationMessage(messageId: number): Promise<LocationMessage> {
    const raw = await apiRequest<unknown>(
      `/api/forum/conversations/${messageId}/restore/`,
      {
        method: 'POST',
        auth: true,
        fallbackError: 'Could not restore that message.',
      },
    );
    return requireLocationMessage(raw, 'Could not restore that message.');
  }
}

export const forumRemoteDatasource = new ForumRemoteDatasource();
