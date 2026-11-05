/** Backend origins come from the same Vite environment as the frontend. */
export const FPLACES_BACKEND_HTTP_ORIGIN =
  (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '');
export const FPLACES_BACKEND_HOST = FPLACES_BACKEND_HTTP_ORIGIN
  ? new URL(FPLACES_BACKEND_HTTP_ORIGIN).host : '';
export const FPLACES_BACKEND_WS_ORIGIN =
  (import.meta.env.VITE_WS_URL ?? '').trim().replace(/\/$/, '') ||
  (FPLACES_BACKEND_HTTP_ORIGIN ? toWebSocketOrigin(FPLACES_BACKEND_HTTP_ORIGIN) : '');

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
