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
  /** True when an HTTPS page is attempting a plain `ws://` socket. */
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
 * Pick a WebSocket origin.
 * Preserve secure configured origins and use the secure backend fallback.
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
  else if (input.fallback) origin = toWebSocketOrigin(input.fallback);
  else if (input.pageHost) {
    origin = `${input.pageProtocol === 'https:' ? 'wss' : 'ws'}://${input.pageHost}`;
  } else {
    origin = '';
  }

  return {
    origin,
    mixedContent: input.pageProtocol === 'https:' && isInsecureWsUrl(origin),
  };
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

export function isMixedContentWebSocketUrl(_url: string): boolean {
  return false;
}

/** Origin + path only: never log the access token query string. */
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
