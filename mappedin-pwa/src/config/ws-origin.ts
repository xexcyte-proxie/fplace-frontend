import { appConfig } from '../config';
import {
  FPLACES_BACKEND_WS_ORIGIN,
  toWebSocketOrigin,
} from './fplaces-backend';

function isInsecureWsUrl(url: string): boolean {
  return url.startsWith('ws://') && !url.startsWith('wss://');
}

export type WsOriginSelection = {
  origin: string;
  /** HTTPS page cannot open `ws://` (browser mixed-content block). */
  mixedContent: boolean;
};

export function isLoopbackOrPrivateHost(host: string): boolean {
  const hostname = host.replace(/:\d+$/, '').toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.endsWith('.local')
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return false;
}

/**
 * Pick a WebSocket origin and whether the browser will block it.
 * On HTTPS + private/LAN hosts, fall back to same-origin `wss:` (Vite `/ws` proxy).
 * On public HTTPS + `ws://` backend, mixed content is blocked until the ALB has TLS.
 */
export function selectWsOrigin(input: {
  configured: string;
  api: string;
  pageProtocol?: string;
  pageHost?: string;
  fallback: string;
}): WsOriginSelection {
  const configured = input.configured.replace(/\/$/, '');
  const api = input.api.replace(/\/$/, '');
  let origin = '';
  if (configured) origin = toWebSocketOrigin(configured);
  else if (api) origin = toWebSocketOrigin(api);
  else if (input.pageHost) {
    const protocol = input.pageProtocol === 'https:' ? 'wss:' : 'ws:';
    origin = `${protocol}//${input.pageHost}`;
  } else {
    origin = toWebSocketOrigin(input.fallback);
  }

  const pageIsHttps = input.pageProtocol === 'https:';
  if (pageIsHttps && isInsecureWsUrl(origin) && input.pageHost) {
    if (isLoopbackOrPrivateHost(input.pageHost)) {
      return { origin: `wss://${input.pageHost}`, mixedContent: false };
    }
    return { origin, mixedContent: true };
  }

  return { origin, mixedContent: false };
}

/**
 * Origin used by venue-room and personal-notification sockets.
 */
export function resolveWsOrigin(): string {
  return selectWsOrigin(currentWsOriginInput()).origin;
}

export function resolveWsOriginSelection(): WsOriginSelection {
  return selectWsOrigin(currentWsOriginInput());
}

function currentWsOriginInput(): {
  configured: string;
  api: string;
  pageProtocol?: string;
  pageHost?: string;
  fallback: string;
} {
  return {
    configured: appConfig.wsUrl,
    api: appConfig.apiUrl,
    pageProtocol:
      typeof window !== 'undefined' ? window.location?.protocol : undefined,
    pageHost: typeof window !== 'undefined' ? window.location?.host : undefined,
    fallback: FPLACES_BACKEND_WS_ORIGIN,
  };
}

export function isMixedContentWebSocketUrl(url: string): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location?.protocol !== 'https:') return false;
  return isInsecureWsUrl(url);
}

/** Origin + path only — never log the access token query string. */
export function describeWsUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split('?')[0] ?? url;
  }
}
