import type {
  AuthSession,
  AuthTokens,
  AuthUser,
  LoginCredentials,
  RegisterCredentials,
  UpdateProfilePayload,
} from '../../domain/entities';
import { apiRequest } from './api-client';

function normalizeSession(body: AuthSession): AuthSession {
  if (!body?.access || !body?.refresh || !body?.user) {
    throw new Error('Invalid auth response: missing tokens or user.');
  }
  return body;
}

export class AuthRemoteDatasource {
  register(credentials: RegisterCredentials): Promise<AuthUser> {
    return apiRequest<AuthUser>('/api/users/register/', {
      method: 'POST',
      body: credentials,
      fallbackError: 'Could not create your account. Please try again.',
    });
  }

  verifyEmail(email: string, otp: string): Promise<AuthUser> {
    return apiRequest<AuthUser>('/api/users/verify-email/', {
      method: 'POST',
      body: { email, otp },
      fallbackError: 'Could not verify your email. Please try again.',
    });
  }

  async resendVerification(email: string): Promise<string> {
    const body = await apiRequest<{ detail?: string; message?: string }>(
      '/api/users/resend-verification/',
      {
        method: 'POST',
        body: { email },
        fallbackError: 'Could not resend the verification code. Please try again.',
      },
    );
    return (
      body.detail?.trim() ||
      body.message?.trim() ||
      'Code sent. Check your email.'
    );
  }

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    const body = await apiRequest<AuthSession>('/api/users/login/', {
      method: 'POST',
      body: credentials,
      fallbackError: 'Could not log in. Check your email and password.',
    });
    return normalizeSession(body);
  }

  async loginWithGoogle(idToken: string): Promise<AuthSession> {
    const body = await apiRequest<AuthSession>('/api/users/login/google/', {
      method: 'POST',
      body: { id_token: idToken },
      fallbackError: 'Google sign-in failed. Please try again.',
    });
    return normalizeSession(body);
  }

  updateProfile(payload: UpdateProfilePayload): Promise<AuthUser> {
    return apiRequest<AuthUser>('/api/users/me/', {
      method: 'PATCH',
      body: payload,
      auth: true,
      fallbackError: 'Could not update your profile. Please try again.',
    });
  }

  getProfile(): Promise<AuthUser> {
    return apiRequest<AuthUser>('/api/users/me/', {
      method: 'GET',
      auth: true,
      fallbackError: 'Could not load your profile. Please try again.',
    });
  }

  refreshTokens(refresh: string): Promise<AuthTokens> {
    return apiRequest<AuthTokens>('/api/users/token/refresh/', {
      method: 'POST',
      body: { refresh },
      skipRefresh: true,
      fallbackError: 'Could not refresh your session. Please log in again.',
    });
  }

  async logout(refresh: string): Promise<void> {
    await apiRequest('/api/users/logout/', {
      method: 'POST',
      body: { refresh },
      auth: true,
      fallbackError: 'Could not log out. Please try again.',
    });
  }

  async deleteAccount(): Promise<void> {
    await apiRequest('/api/users/me/', {
      method: 'DELETE',
      auth: true,
      fallbackError: 'Could not delete your account. Please try again.',
    });
  }
}

export const authRemoteDatasource = new AuthRemoteDatasource();
