import {
  containsTokenNotValidDetail,
  isTokenNotValidForAnyType,
  type AuthSessionClearedReason,
} from '../../domain/invalid-access-token';
import { resolveUserFacingApiErrorMessage } from '../../domain/user-facing-api-error';
import { appConfig } from '../../../config';
import { tokenLocalDatasource } from './token-local-datasource';

export type { AuthSessionClearedReason };

export interface ApiErrorBody {
  status?: string;
  message?: string;
  detail?: string;
  code?: string;
  details?: Record<string, string[] | string>;
  messages?: unknown;
}

export class AuthApiError extends Error {
  readonly fieldErrors: Record<string, string>;
  readonly summary: string;
  readonly status: number;
  readonly code: string | null;
  readonly body: ApiErrorBody;

  constructor(body: ApiErrorBody, fallbackMessage: string, status = 0) {
    const serverMessage =
      body.message?.trim() ||
      (typeof body.detail === 'string' ? body.detail.trim() : '') ||
      '';
    const summary = resolveUserFacingApiErrorMessage(
      serverMessage,
      fallbackMessage,
    );
    super(summary);
    this.name = 'AuthApiError';
    this.summary = summary;
    this.status = status;
    this.code = typeof body.code === 'string' ? body.code.trim() : null;
    this.body = body;
    this.fieldErrors = flattenFieldErrors(body.details);
  }
}

/** True when an API/network error means the user must sign in again. */
export function isAuthCredentialFailure(error: unknown): boolean {
  if (isInvalidAccessTokenFailure(error)) return true;
  if (error instanceof AuthApiError) {
    if (error.status === 401 || error.status === 403) return true;
    return looksLikeAuthCredentialMessage(error.summary);
  }
  if (error instanceof Error) {
    return looksLikeAuthCredentialMessage(error.message);
  }
  return false;
}

/** SimpleJWT: Bearer JWT expired, wrong class, or otherwise unreadable. */
export function isInvalidAccessTokenFailure(error: unknown): boolean {
  if (error instanceof AuthApiError) {
    return containsTokenNotValidDetail({
      summary: error.summary,
      code: error.code,
      fieldErrors: error.fieldErrors,
      body: error.body,
    });
  }
  if (error instanceof Error) {
    return containsTokenNotValidDetail(error.message);
  }
  return containsTokenNotValidDetail(error);
}

function looksLikeAuthCredentialMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('authentication credentials') ||
    normalized.includes('credentials were not provided') ||
    normalized.includes('invalid credentials') ||
    normalized.includes('please log in again') ||
    normalized.includes('session expired') ||
    normalized.includes('not authenticated') ||
    normalized.includes('authentication required') ||
    isTokenNotValidForAnyType(normalized)
  );
}

function sessionClearedReasonFromBody(
  body: ApiErrorBody,
): AuthSessionClearedReason {
  return containsTokenNotValidDetail(body) ? 'invalid-token' : 'expired';
}

function flattenFieldErrors(
  details?: Record<string, string[] | string>,
): Record<string, string> {
  if (!details) return {};
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(details)) {
    if (typeof messages === 'string' && messages.trim()) {
      out[field] = messages;
      continue;
    }
    if (Array.isArray(messages) && messages.length) {
      out[field] = String(messages[0]);
    }
  }
  return out;
}

function apiUrl(path: string): string {
  const base = appConfig.apiUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function parseBody<T>(response: Response): Promise<T | ApiErrorBody> {
  try {
    return (await response.json()) as T | ApiErrorBody;
  } catch {
    return {} as ApiErrorBody;
  }
}

function throwIfError(
  response: Response,
  body: ApiErrorBody,
  fallbackError: string,
): void {
  if (response.ok) return;
  const serverMessage = body.message?.trim() || body.detail?.trim();
  throw new AuthApiError(
    body,
    response.status === 400
      ? 'Please check your details and try again.'
      : response.status === 401
        ? 'Your session expired. Please log in again.'
        : response.status === 403
          ? serverMessage ||
            'Guest trial has expired. Create an account to continue.'
          : response.status === 404
            ? 'Service not found. Check API configuration.'
            : response.status === 502
              ? serverMessage ||
                'Could not retrieve map credentials. Please try again.'
              : serverMessage || fallbackError,
    response.status,
  );
}

let refreshInFlight: Promise<string | null> | null = null;

type AuthSessionClearedListener = (reason: AuthSessionClearedReason) => void;
const authSessionClearedListeners = new Set<AuthSessionClearedListener>();

/** Notify when JWTs are cleared after a failed refresh so UI state can reset. */
export function onAuthSessionCleared(
  listener: AuthSessionClearedListener,
): () => void {
  authSessionClearedListeners.add(listener);
  return () => {
    authSessionClearedListeners.delete(listener);
  };
}

function clearTokensAndNotify(reason: AuthSessionClearedReason = 'expired'): void {
  const hadToken = tokenLocalDatasource.hasAccessToken();
  tokenLocalDatasource.clear();
  if (!hadToken) return;
  for (const listener of authSessionClearedListeners) {
    try {
      listener(reason);
    } catch {
      /* listener errors must not break auth */
    }
  }
}

/** Clear JWTs and notify the app (e.g. route to sign-in). */
export function clearAuthSessionLocally(
  reason: AuthSessionClearedReason = 'expired',
): void {
  clearTokensAndNotify(reason);
}

async function refreshAccessToken(
  reason: AuthSessionClearedReason = 'expired',
): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    // Guest JWTs have no refresh token - do not attempt /token/refresh/.
    if (tokenLocalDatasource.isGuestToken() || !tokenLocalDatasource.getRefreshToken()) {
      if (tokenLocalDatasource.isGuestToken()) {
        clearTokensAndNotify(reason);
      } else if (!tokenLocalDatasource.getRefreshToken()) {
        clearTokensAndNotify(reason);
      }
      return null;
    }

    const refresh = tokenLocalDatasource.getRefreshToken();
    if (!refresh) {
      clearTokensAndNotify();
      return null;
    }

    try {
      const response = await fetch(apiUrl('/api/users/token/refresh/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ refresh }),
      });
      const body = await parseBody<{ access: string; refresh?: string }>(
        response,
      );

      // Logout or a newer sign-in invalidates this pending refresh response.
      if (tokenLocalDatasource.getRefreshToken() !== refresh) return null;
      if (!response.ok) {
        const refreshBody = body as ApiErrorBody;
        clearTokensAndNotify(sessionClearedReasonFromBody(refreshBody));
        return null;
      }

      const tokens = body as { access: string; refresh?: string };
      if (!tokens.access) {
        clearTokensAndNotify();
        return null;
      }

      if (tokens.refresh) {
        tokenLocalDatasource.save({
          access: tokens.access,
          refresh: tokens.refresh,
        });
      } else {
        tokenLocalDatasource.updateAccess(tokens.access);
      }
      return tokens.access;
    } catch {
      if (tokenLocalDatasource.getRefreshToken() === refresh) clearTokensAndNotify();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  fallbackError?: string;
  /** Skip 401 → refresh → retry (used by the refresh call itself). */
  skipRefresh?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    auth = false,
    fallbackError = 'Request failed. Please try again.',
    skipRefresh = false,
  } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth) {
    const access = tokenLocalDatasource.getAccessToken();
    if (access) {
      headers.Authorization = `Bearer ${access}`;
    }
  }

  const response = await fetch(apiUrl(path), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const parsed = await parseBody<T>(response);

  if (response.status === 401 && auth && !skipRefresh) {
    const wasGuestAuth = tokenLocalDatasource.isGuestToken();
    const nextAccess = await refreshAccessToken(
      wasGuestAuth
        ? 'guest-expired'
        : sessionClearedReasonFromBody(parsed as ApiErrorBody),
    );
    if (nextAccess) {
      return apiRequest<T>(path, { ...options, skipRefresh: true });
    }
  }

  throwIfError(response, parsed as ApiErrorBody, fallbackError);
  return parsed as T;
}
