import { appConfig } from '../../../config';
import { tokenLocalDatasource } from '../../../auth/data/datasources/token-local-datasource';
import type {
  SectionHeatEntry,
  SectionHeatPriority,
  VenueLiveConnectionStatus,
  VenueLiveEvent,
  VenueLiveEventHandler,
  VenueLiveStatusHandler,
  VenueLiveSubscription,
} from '../../domain/entities';
import { coerceForumPost } from '../mappers/forum-post-mapper';
import { appLog, appWarn } from '../../../utils/logger';

const RECONNECT_BASE_MS = 1_500;
const RECONNECT_MAX_MS = 20_000;

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
    let socket: WebSocket | null = null;
    let closedByClient = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let hasConnectedOnce = false;

    const emitStatus = (status: VenueLiveConnectionStatus) => {
      onStatus?.(status);
    };

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const open = () => {
      const token = tokenLocalDatasource.getAccessToken();
      if (!token) {
        appWarn('ForumWS', 'No access token; venue live socket paused');
        emitStatus('auth_missing');
        scheduleReconnect();
        return;
      }

      const url = buildVenueWsUrl(venueId, token);
      emitStatus(hasConnectedOnce ? 'reconnecting' : 'connecting');
      // Full URL for Postman / DevTools WS checks (includes token).
      console.log(`[IndoorNav/ForumWS] Venue WS URL (copy for Postman):\n${url}`);
      appLog('ForumWS', `Opening venue room ${venueId}: ${url}`);

      try {
        socket = new WebSocket(url);
      } catch (error) {
        appWarn('ForumWS', 'Failed to open socket', error);
        emitStatus('disconnected');
        scheduleReconnect();
        return;
      }

      socket.addEventListener('open', () => {
        reconnectAttempts = 0;
        hasConnectedOnce = true;
        emitStatus('connected');
        appLog('ForumWS', `Venue room ${venueId} connected`);
      });

      socket.addEventListener('message', (event) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          appWarn('ForumWS', 'Non-JSON message ignored');
          return;
        }

        const liveEvent = parseVenueLiveMessage(parsed);
        if (!liveEvent) return;
        onEvent(liveEvent);
      });

      socket.addEventListener('close', (event) => {
        socket = null;
        if (closedByClient) return;
        appWarn('ForumWS', `Venue room ${venueId} closed`, {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        emitStatus('disconnected');
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        appWarn('ForumWS', `Venue room ${venueId} socket error`);
      });
    };

    const scheduleReconnect = () => {
      if (closedByClient) return;
      clearReconnect();
      const delay = Math.min(
        RECONNECT_MAX_MS,
        RECONNECT_BASE_MS * 2 ** reconnectAttempts,
      );
      reconnectAttempts += 1;
      emitStatus(hasConnectedOnce ? 'reconnecting' : 'connecting');
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        open();
      }, delay);
    };

    open();

    return {
      disconnect() {
        closedByClient = true;
        clearReconnect();
        if (socket && socket.readyState < WebSocket.CLOSING) {
          socket.close();
        }
        socket = null;
        emitStatus('idle');
      },
    };
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
    case 'new_post': {
      const post = coerceForumPost(
        extractObject(message, ['post', 'payload', 'data']) ?? message,
      );
      if (!post) return null;
      return { type: 'new_post', post };
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

function resolveWsOrigin(): string {
  const configured = appConfig.wsUrl.replace(/\/$/, '');
  if (configured) return configured;

  const api = appConfig.apiUrl.replace(/\/$/, '');
  if (api) return api.replace(/^http/i, 'ws');

  if (typeof window !== 'undefined' && window.location?.host) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  return 'wss://fplaces-backend.vercel.app';
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
