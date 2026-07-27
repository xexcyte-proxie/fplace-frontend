import { appConfig } from '../../../config';
import { tokenLocalDatasource } from '../../../auth/data/datasources/token-local-datasource';
import type {
  PersonalNotificationEvent,
  PersonalNotificationEventHandler,
  PersonalNotificationSubscription,
} from '../../domain/entities';
import { appWarn } from '../../../utils/logger';
import { coerceNotification } from './notifications-remote-datasource';

const RECONNECT_BASE_MS = 1_500;
const RECONNECT_MAX_MS = 20_000;

/**
 * Receive-only WebSocket to `ws/notifications/?token=<access_token>`.
 * Never sends application payloads upstream.
 */
export class NotificationsWsDatasource {
  connect(
    onEvent: PersonalNotificationEventHandler,
  ): PersonalNotificationSubscription {
    let socket: WebSocket | null = null;
    let closedByClient = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const open = () => {
      const token = tokenLocalDatasource.getAccessToken();
      if (!token) {
        appWarn('NotificationsWS', 'No access token; skipping personal socket');
        return;
      }

      const url = buildNotificationsWsUrl(token);
      try {
        socket = new WebSocket(url);
      } catch (error) {
        appWarn('NotificationsWS', 'Failed to open socket', error);
        scheduleReconnect();
        return;
      }

      socket.addEventListener('open', () => {
        reconnectAttempts = 0;
      });

      socket.addEventListener('message', (event) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          appWarn('NotificationsWS', 'Non-JSON message ignored');
          return;
        }

        const liveEvent = parsePersonalNotificationMessage(parsed);
        if (!liveEvent) return;
        onEvent(liveEvent);
      });

      socket.addEventListener('close', () => {
        socket = null;
        if (!closedByClient) scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        // `close` follows; reconnect is scheduled there.
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
      },
    };
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
  if (type !== 'new_notification') return null;

  const notification = coerceNotification(
    extractObject(message, ['notification', 'payload', 'data']) ?? message,
  );
  if (!notification) return null;
  return { type: 'new_notification', notification };
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

export const notificationsWsDatasource = new NotificationsWsDatasource();
