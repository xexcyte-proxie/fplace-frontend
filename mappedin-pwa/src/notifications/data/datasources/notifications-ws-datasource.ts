import { resolveWsOrigin } from '../../../config/ws-origin';
import { connectReconnectingWebSocket } from '../../../config/reconnecting-websocket';
import { tokenLocalDatasource } from '../../../auth/data/datasources/token-local-datasource';
import type {
  PersonalNotificationEvent,
  PersonalNotificationEventHandler,
  PersonalNotificationSubscription,
} from '../../domain/entities';
import { coerceNotification } from './notifications-remote-datasource';

/**
 * Receive-only WebSocket to `ws/notifications/?token=<access_token>`.
 * Never sends application payloads upstream.
 */
export class NotificationsWsDatasource {
  connect(
    onEvent: PersonalNotificationEventHandler,
  ): PersonalNotificationSubscription {
    return connectReconnectingWebSocket({
      logTag: 'NotificationsWS',
      buildUrl: () => {
        const token = tokenLocalDatasource.getUserAccessToken();
        if (!token) return null;
        return buildNotificationsWsUrl(token);
      },
      onMessage: (parsed) => {
        const liveEvent = parsePersonalNotificationMessage(parsed);
        if (!liveEvent) return;
        onEvent(liveEvent);
      },
    });
  }
}

export function buildNotificationsWsUrl(accessToken: string): string {
  const origin = resolveWsOrigin();
  const url = new URL('/ws/notifications/', `${origin}/`);
  url.searchParams.set('token', accessToken);
  return url.toString();
}

export function parsePersonalNotificationMessage(
  raw: unknown,
): PersonalNotificationEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const message = raw as Record<string, unknown>;
  const type = String(message.type ?? message.event ?? '').trim();
  if (type !== 'new_notification' && type !== 'notification') return null;

  const payload =
    extractObject(message, ['notification', 'payload', 'data']) ?? message;
  const cleaned = { ...payload };
  if (cleaned.type === 'new_notification' || cleaned.type === 'notification') {
    delete cleaned.type;
  }
  const notification = coerceNotification(cleaned);
  if (!notification) return null;
  return { type: 'new_notification', notification };
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

export const notificationsWsDatasource = new NotificationsWsDatasource();
