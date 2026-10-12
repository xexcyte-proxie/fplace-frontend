import { appLog, appWarn } from '../utils/logger';
import {
  describeWsUrl,
  isMixedContentWebSocketUrl,
} from './ws-origin';

export type LiveSocketStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'auth_missing'
  | 'unavailable';

export const WS_OPEN_TIMEOUT_MS = 8_000;
export const WS_RECONNECT_BASE_MS = 1_500;
export const WS_RECONNECT_MAX_MS = 20_000;

export interface ReconnectingWebSocketSubscription {
  disconnect(): void;
}

/**
 * Receive-only socket with handshake timeout and backoff.
 * The timeout prevents a stalled WebSocket handshake from leaving the UI stuck.
 */
export function connectReconnectingWebSocket(options: {
  logTag: string;
  buildUrl: () => string | null;
  onMessage: (parsed: unknown) => void;
  onStatus?: (status: LiveSocketStatus) => void;
}): ReconnectingWebSocketSubscription {
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let openTimer: ReturnType<typeof setTimeout> | null = null;
  let hasConnectedOnce = false;
  let lastStatus: LiveSocketStatus | null = null;

  const emitStatus = (status: LiveSocketStatus) => {
    if (lastStatus === status) return;
    lastStatus = status;
    options.onStatus?.(status);
  };

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const clearOpenTimer = () => {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
  };

  const dropSocket = () => {
    clearOpenTimer();
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close();
    }
    socket = null;
  };

  const scheduleReconnect = () => {
    if (closedByClient) return;
    clearReconnect();
    const delay = Math.min(
      WS_RECONNECT_MAX_MS,
      WS_RECONNECT_BASE_MS * 2 ** reconnectAttempts,
    );
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, delay);
  };

  const open = () => {
    if (closedByClient) return;

    const url = options.buildUrl();
    if (!url) {
      appWarn(options.logTag, 'No user access token; live socket paused');
      emitStatus('auth_missing');
      return;
    }

    if (isMixedContentWebSocketUrl(url)) {
      appWarn(
        options.logTag,
        `Blocked mixed-content socket: ${describeWsUrl(url)}`,
      );
      emitStatus('unavailable');
      return;
    }

    emitStatus(hasConnectedOnce ? 'reconnecting' : 'connecting');
    appLog(options.logTag, `Opening ${describeWsUrl(url)}`);

    try {
      socket = new WebSocket(url);
    } catch (error) {
      appWarn(options.logTag, 'Failed to open socket', error);
      emitStatus(hasConnectedOnce ? 'reconnecting' : 'connecting');
      scheduleReconnect();
      return;
    }

    const current = socket;
    let attemptSettled = false;
    const settleDisconnected = () => {
      if (attemptSettled || closedByClient) return;
      attemptSettled = true;
      clearOpenTimer();
      if (socket === current) socket = null;
      // Stay on connecting/reconnecting while we will retry: do not flash
      // "offline" between attempts.
      emitStatus(hasConnectedOnce ? 'reconnecting' : 'connecting');
      scheduleReconnect();
    };

    openTimer = setTimeout(() => {
      openTimer = null;
      if (closedByClient || attemptSettled) return;
      if (current.readyState === WebSocket.CONNECTING) {
        appWarn(options.logTag, 'Handshake timed out');
        try {
          current.close();
        } catch {
          /* ignore */
        }
        settleDisconnected();
      }
    }, WS_OPEN_TIMEOUT_MS);

    current.addEventListener('open', () => {
      if (socket !== current || attemptSettled) return;
      clearOpenTimer();
      reconnectAttempts = 0;
      hasConnectedOnce = true;
      emitStatus('connected');
      appLog(options.logTag, 'Connected');
    });

    current.addEventListener('message', (event) => {
      if (socket !== current) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        appWarn(options.logTag, 'Non-JSON message ignored');
        return;
      }
      options.onMessage(parsed);
    });

    current.addEventListener('close', (event) => {
      if (attemptSettled) return;
      if (socket !== current && socket !== null) return;
      appWarn(options.logTag, 'Socket closed', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      settleDisconnected();
    });

    current.addEventListener('error', () => {
      appWarn(options.logTag, 'Socket error');
    });
  };

  open();

  return {
    disconnect() {
      closedByClient = true;
      clearReconnect();
      dropSocket();
      emitStatus('idle');
    },
  };
}
