/** Live fplaces API / WebSocket host (AWS ALB). HTTP only until TLS is attached. */
export const FPLACES_BACKEND_HOST =
  'fplaces-alb-1964416382.us-east-1.elb.amazonaws.com';

export const FPLACES_BACKEND_HTTP_ORIGIN = `http://${FPLACES_BACKEND_HOST}`;

export const FPLACES_BACKEND_WS_ORIGIN = `ws://${FPLACES_BACKEND_HOST}`;

/** Normalize an HTTP(S) or WS(S) origin to a `ws:` / `wss:` origin. */
export function toWebSocketOrigin(origin: string): string {
  const trimmed = origin.replace(/\/$/, '');
  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}`;
  }
  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}`;
  }
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed;
  }
  return `ws://${trimmed}`;
}
