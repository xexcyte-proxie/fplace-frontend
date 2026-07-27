import { appConfig } from '../../../config';
import { tokenLocalDatasource } from './token-local-datasource';

export interface ApiErrorBody {
  status?: string;
  message?: string;
  detail?: string;
  details?: Record<string, string[] | string>;
}

export class AuthApiError extends Error {
  readonly fieldErrors: Record<string, string>;
  readonly summary: string;
  readonly status: number;

  constructor(body: ApiErrorBody, fallbackMessage: string, status = 0) {
    const summary =
      body.message?.trim() ||
      (typeof body.detail === 'string' ? body.detail.trim() : '') ||
      fallbackMessage;
    super(summary);
    this.name = 'AuthApiError';
    this.summary = summary;
    this.status = status;
    this.fieldErrors = flattenFieldErrors(body.details);
  }
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
        : response.status === 404
          ? 'Service not found. Check API configuration.'
          : serverMessage || fallbackError,
    response.status,
  );
}

let refreshInFlight: Promise<string | null> | null = null;

type AuthSessionClearedListener = () => void;
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

function clearTokensAndNotify(): void {
  tokenLocalDatasource.clear();
  for (const listener of authSessionClearedListeners) {
    try {
      listener();
    } catch {
      /* listener errors must not break auth */
    }
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
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

      if (!response.ok) {
        clearTokensAndNotify();
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
      clearTokensAndNotify();
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

  if (response.status === 401 && auth && !skipRefresh) {
    const nextAccess = await refreshAccessToken();
    if (nextAccess) {
      return apiRequest<T>(path, { ...options, skipRefresh: true });
    }
  }

  const parsed = await parseBody<T>(response);
  throwIfError(response, parsed as ApiErrorBody, fallbackError);
  return parsed as T;
}
