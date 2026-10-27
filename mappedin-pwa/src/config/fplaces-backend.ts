/** Live fplaces REST API host (AWS ALB). */
export const FPLACES_BACKEND_HOST =
  'fplaces-alb-1964416382.us-east-1.elb.amazonaws.com';

export const FPLACES_BACKEND_HTTP_ORIGIN = `http://${FPLACES_BACKEND_HOST}`;

export const FPLACES_BACKEND_WS_ORIGIN = 'wss://api.fplaces.com';

/** Normalize an HTTP(S) or WS(S) origin to a WebSocket origin, preserving transport security. */
export function toWebSocketOrigin(origin: string): string {
  const trimmed = origin.replace(/\/$/, '');
  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}`;
  }
  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}`;
  }
  if (trimmed.startsWith('wss://')) {
    return trimmed;
  }
  if (trimmed.startsWith('ws://')) {
    return trimmed;
  }
  return `wss://${trimmed}`;
}
