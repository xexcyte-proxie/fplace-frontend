import { appConfig } from '../config';
import type { RegisteredUser } from '../types';

export interface RegisterPayload {
  email: string;
  password: string;
  password_confirm: string;
}

export interface VerifyEmailPayload {
  email: string;
  otp: string;
}

export interface ResendVerificationPayload {
  email: string;
}

interface ApiErrorBody {
  status?: string;
  message?: string;
  detail?: string;
  details?: Record<string, string[]>;
}

export class AuthApiError extends Error {
  readonly fieldErrors: Record<string, string>;
  readonly summary: string;

  constructor(body: ApiErrorBody, fallbackMessage: string) {
    const summary =
      body.message?.trim() || body.detail?.trim() || fallbackMessage;
    super(summary);
    this.name = 'AuthApiError';
    this.summary = summary;
    this.fieldErrors = flattenFieldErrors(body.details);
  }
}

function flattenFieldErrors(
  details?: Record<string, string[]>,
): Record<string, string> {
  if (!details) return {};
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(details)) {
    if (messages?.length) out[field] = messages[0]!;
  }
  return out;
}

function apiUrl(path: string): string {
  const base = appConfig.apiUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function postJson<T>(
  path: string,
  payload: unknown,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  let body: T | ApiErrorBody = {} as T;
  try {
    body = (await response.json()) as T | ApiErrorBody;
  } catch {
    /* non-JSON response */
  }

  if (!response.ok) {
    const errorBody = body as ApiErrorBody;
    const serverMessage = errorBody.message?.trim() || errorBody.detail?.trim();
    throw new AuthApiError(
      errorBody,
      response.status === 400
        ? 'Please check your details and try again.'
        : response.status === 404
          ? 'Service not found. Check API configuration.'
          : serverMessage || fallbackError,
    );
  }

  return body as T;
}

export async function registerUser(
  payload: RegisterPayload,
): Promise<RegisteredUser> {
  return postJson<RegisteredUser>(
    '/api/users/register/',
    payload,
    'Could not create your account. Please try again.',
  );
}

export async function verifyEmail(
  email: string,
  otp: string,
): Promise<RegisteredUser> {
  const payload: VerifyEmailPayload = { email, otp };
  return postJson<RegisteredUser>(
    '/api/users/verify-email/',
    payload,
    'Could not verify your email. Please try again.',
  );
}

export async function resendVerification(email: string): Promise<string> {
  const payload: ResendVerificationPayload = { email };
  const body = await postJson<{ detail?: string; message?: string }>(
    '/api/users/resend-verification/',
    payload,
    'Could not resend the verification code. Please try again.',
  );
  return (
    body.detail?.trim() ||
    body.message?.trim() ||
    'Verification email sent if the account exists and is not yet verified.'
  );
}
