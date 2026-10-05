/**
 * Detects raw HTTP status / phrase payloads that should never reach the snackbar.
 * Prefer curated fallbacks like "Your session expired…" instead.
 */
const TECHNICAL_HTTP_PHRASES = new Set([
  'unauthorized',
  'forbidden',
  'not found',
  'bad request',
  'bad gateway',
  'internal server error',
  'service unavailable',
  'gateway timeout',
  'error',
  'http error',
]);

function isInvalidLoginMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes('no active account found') ||
    normalized.includes('given credentials') ||
    normalized.includes('invalid credentials')
  );
}

export function isTechnicalHttpErrorMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return true;
  if (/^\d{3}$/.test(normalized)) return true;
  if (/^http[\s:-]*\d{3}\b/.test(normalized)) return true;
  return TECHNICAL_HTTP_PHRASES.has(normalized);
}

/**
 * Prefer a real API explanation; fall back when the body is empty or only a status code.
 */
export function resolveUserFacingApiErrorMessage(
  serverMessage: string | null | undefined,
  fallbackMessage: string,
): string {
  const trimmed = serverMessage?.trim() ?? '';
  if (isInvalidLoginMessage(trimmed)) {
    return 'Wrong email or password.';
  }
  if (!trimmed || isTechnicalHttpErrorMessage(trimmed)) {
    const fallback = fallbackMessage.trim();
    return fallback || 'Something went wrong. Please try again.';
  }
  return trimmed;
}
