import { resolveWsOrigin } from '../../../config/ws-origin';
import { connectReconnectingWebSocket } from '../../../config/reconnecting-websocket';
import { tokenLocalDatasource } from '../../../auth/data/datasources/token-local-datasource';
import type {
  SectionHeatEntry,
  SectionHeatPriority,
  VenueLiveEvent,
  VenueLiveEventHandler,
  VenueLiveStatusHandler,
  VenueLiveSubscription,
} from '../../domain/entities';
import { coerceForumComment } from '../mappers/forum-comment-mapper';
import { coerceForumPost } from '../mappers/forum-post-mapper';

/**
 * Receive-only WebSocket to `ws/venues/<venue_id>/?token=<access_token>`.
 * Never sends application payloads upstream.
 */
export class ForumWsDatasource {
  connect(
    venueId: number,
    onEvent: VenueLiveEventHandler,
    onStatus?: VenueLiveStatusHandler,
  ): VenueLiveSubscription {
    return connectReconnectingWebSocket({
      logTag: 'ForumWS',
      buildUrl: () => {
        const token = tokenLocalDatasource.getUserAccessToken();
        if (!token) return null;
        return buildVenueWsUrl(venueId, token);
      },
      onMessage: (parsed) => {
        const liveEvent = parseVenueLiveMessage(parsed);
        if (!liveEvent) return;
        onEvent(liveEvent);
      },
      onStatus,
    });
  }
}

export function buildVenueWsUrl(venueId: number, accessToken: string): string {
  const origin = resolveWsOrigin();
  const url = new URL(`/ws/venues/${venueId}/`, `${origin}/`);
  url.searchParams.set('token', accessToken);
  return url.toString();
}

export function parseVenueLiveMessage(raw: unknown): VenueLiveEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const message = raw as Record<string, unknown>;
  const type = String(message.type ?? message.event ?? '').trim();
  if (!type) return null;

  switch (type) {
    case 'new_post':
    case 'post_updated':
    case 'post_update': {
      const post = coerceForumPost(
        extractObject(message, ['post', 'payload', 'data']) ?? message,
      );
      if (!post) return null;
      return { type: 'new_post', post };
    }
    case 'new_comment':
    case 'comment_created': {
      const comment = coerceForumComment(
        extractObject(message, ['comment', 'payload', 'data']) ?? message,
      );
      if (!comment) return null;
      return { type: 'new_comment', comment };
    }
    case 'upvote_update': {
      const payload =
        extractObject(message, ['payload', 'data']) ?? message;
      const postId = Number(
        (payload as { post_id?: unknown }).post_id ??
          (payload as { postId?: unknown }).postId,
      );
      const upvotesCount = Number(
        (payload as { upvotes_count?: unknown }).upvotes_count ??
          (payload as { upvotesCount?: unknown }).upvotesCount,
      );
      if (!Number.isFinite(postId) || !Number.isFinite(upvotesCount)) return null;
      const upvotedRaw = (payload as { upvoted?: unknown }).upvoted;
      return {
        type: 'upvote_update',
        update: {
          postId,
          upvotesCount,
          upvoted: typeof upvotedRaw === 'boolean' ? upvotedRaw : undefined,
        },
      };
    }
    case 'post_hidden': {
      const payload =
        extractObject(message, ['payload', 'data']) ?? message;
      const postId = Number(
        (payload as { post_id?: unknown }).post_id ??
          (payload as { postId?: unknown }).postId,
      );
      if (!Number.isFinite(postId)) return null;
      return { type: 'post_hidden', postId };
    }
    case 'section_heat_update': {
      const payload =
        extractObject(message, ['payload', 'data']) ?? message;
      const rows = (payload as { heatmap?: unknown }).heatmap;
      if (!Array.isArray(rows)) return { type: 'section_heat_update', heatmap: [] };
      const heatmap: SectionHeatEntry[] = rows
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const entry = row as Record<string, unknown>;
          const sectionId = Number(entry.section_id ?? entry.sectionId);
          const postCount = Number(entry.post_count ?? entry.postCount) || 0;
          if (!Number.isFinite(sectionId)) return null;
          return {
            sectionId,
            postCount,
            priority: normalizePriority(String(entry.priority ?? 'low')),
          } satisfies SectionHeatEntry;
        })
        .filter((entry): entry is SectionHeatEntry => entry != null);
      return { type: 'section_heat_update', heatmap };
    }
    default:
      return null;
  }
}

function extractObject(
  message: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = message[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function normalizePriority(value: string): SectionHeatPriority {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }
  return 'low';
}

export const forumWsDatasource = new ForumWsDatasource();
