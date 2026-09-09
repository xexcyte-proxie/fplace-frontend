import type {
  ForumComment,
  ForumPost,
  SectionHeatEntry,
  VenueLiveEvent,
} from './entities';

/** In-memory venue-room snapshot after REST seed + WebSocket patches. */
export interface VenueLiveSnapshot {
  posts: ForumPost[];
  heatmap: SectionHeatEntry[];
  heatmapActive: boolean;
}

export interface ApplyVenueLiveEventResult {
  snapshot: VenueLiveSnapshot;
  /** Comment to append when the matching thread is open in the UI. */
  liveComment: ForumComment | null;
}

/**
 * Pure venue-room reducer. MapApp maps the resulting posts into the social feed.
 */
export function applyVenueLiveEvent(
  snapshot: VenueLiveSnapshot,
  event: VenueLiveEvent,
  venueId?: number,
): ApplyVenueLiveEventResult {
  switch (event.type) {
    case 'new_post': {
      if (
        venueId != null &&
        Number.isFinite(venueId) &&
        event.post.venue !== venueId
      ) {
        return { snapshot, liveComment: null };
      }
      return {
        snapshot: {
          ...snapshot,
          posts: mergeLivePost(snapshot.posts, event.post),
        },
        liveComment: null,
      };
    }
    case 'upvote_update': {
      return {
        snapshot: {
          ...snapshot,
          posts: applyUpvoteUpdate(snapshot.posts, event.update),
        },
        liveComment: null,
      };
    }
    case 'post_hidden': {
      return {
        snapshot: {
          ...snapshot,
          posts: snapshot.posts.filter((post) => post.id !== event.postId),
        },
        liveComment: null,
      };
    }
    case 'section_heat_update': {
      return {
        snapshot: {
          ...snapshot,
          heatmap: event.heatmap,
          heatmapActive: true,
        },
        liveComment: null,
      };
    }
    case 'new_comment': {
      return {
        snapshot: snapshot,
        liveComment: event.comment,
      };
    }
    default:
      return { snapshot, liveComment: null };
  }
}

export function mergeLivePost(
  posts: ForumPost[],
  incoming: ForumPost,
): ForumPost[] {
  if (incoming.status === 'hidden') {
    return posts.filter((post) => post.id !== incoming.id);
  }

  const index = posts.findIndex((post) => post.id === incoming.id);
  if (index < 0) {
    return [incoming, ...posts];
  }

  const existing = posts[index];
  const merged = isPartialLivePost(incoming)
    ? {
        ...existing,
        upvotes_count: incoming.upvotes_count,
        has_upvoted: incoming.has_upvoted,
        flags_count: incoming.flags_count,
        status: incoming.status,
      }
    : incoming;
  return posts.map((post, postIndex) =>
    postIndex === index ? merged : post,
  );
}

function applyUpvoteUpdate(
  posts: ForumPost[],
  update: {
    postId: number;
    upvotesCount: number;
    upvoted?: boolean;
  },
): ForumPost[] {
  return posts.map((post) =>
    post.id === update.postId
      ? {
          ...post,
          upvotes_count: update.upvotesCount,
          ...(typeof update.upvoted === 'boolean'
            ? { has_upvoted: update.upvoted }
            : {}),
        }
      : post,
  );
}

function isPartialLivePost(post: ForumPost): boolean {
  return !post.content || post.user.id <= 0;
}
