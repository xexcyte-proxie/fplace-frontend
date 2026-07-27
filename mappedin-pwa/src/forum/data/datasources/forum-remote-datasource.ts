import { apiRequest } from '../../../auth/data/datasources/api-client';
import type {
  CreatePostPayload,
  FlagPostPayload,
  ForumCategory,
  ForumPost,
  ForumSection,
  ForumVenue,
  ListPostsParams,
  PaginatedList,
} from '../../domain/entities';
import {
  coerceForumPost,
  coerceForumPostList,
} from '../mappers/forum-post-mapper';

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

export class ForumRemoteDatasource {
  listVenues(page = 1): Promise<PaginatedList<ForumVenue>> {
    return apiRequest<PaginatedList<ForumVenue>>(
      withQuery('/api/forum/venues/', { page }),
      {
        fallbackError: 'Could not load venues. Please try again.',
      },
    );
  }

  listSections(venueId: number, page = 1): Promise<PaginatedList<ForumSection>> {
    return apiRequest<PaginatedList<ForumSection>>(
      withQuery('/api/forum/sections/', {
        venue: venueId,
        is_active: true,
        page,
      }),
      {
        fallbackError: 'Could not load sections for this venue.',
      },
    );
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

    // Some backends return a partial upvote payload instead of a full post.
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
}

export const forumRemoteDatasource = new ForumRemoteDatasource();
