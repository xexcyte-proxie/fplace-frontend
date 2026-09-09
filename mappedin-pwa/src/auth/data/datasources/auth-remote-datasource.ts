import type {
  AuthSession,
  AuthTokens,
  AuthUser,
  ChangePasswordPayload,
  LoginCredentials,
  PasswordResetConfirmPayload,
  RegisterCredentials,
  UpdateProfilePayload,
} from '../../domain/entities';
import { parseInterestOptionsPayload } from '../../domain/interest-options';
import { apiRequest } from './api-client';

function normalizeSession(body: AuthSession): AuthSession {
  if (!body?.access || !body?.refresh || !body?.user) {
    throw new Error('Invalid auth response: missing tokens or user.');
  }
  return body;
}

function detailMessage(
  body: { detail?: string; message?: string },
  fallback: string,
): string {
  return body.detail?.trim() || body.message?.trim() || fallback;
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
    return detailMessage(body, 'Code sent. Check your email.');
  }

  async requestPasswordReset(email: string): Promise<string> {
    const body = await apiRequest<{ detail?: string; message?: string }>(
      '/api/users/password-reset/',
      {
        method: 'POST',
        body: { email },
        fallbackError: 'Could not send a reset link. Please try again.',
      },
    );
    return detailMessage(body, 'Reset link sent. Check your email.');
  }

  async confirmPasswordReset(
    payload: PasswordResetConfirmPayload,
  ): Promise<string> {
    const body = await apiRequest<{ detail?: string; message?: string }>(
      '/api/users/password-reset-confirm/',
      {
        method: 'POST',
        body: payload,
        fallbackError:
          'Could not reset your password. The link may have expired.',
      },
    );
    return detailMessage(body, 'Password updated. You can log in now.');
  }

  async changePassword(payload: ChangePasswordPayload): Promise<string> {
    const body = await apiRequest<{ detail?: string; message?: string }>(
      '/api/users/change-password/',
      {
        method: 'POST',
        auth: true,
        body: payload,
        fallbackError: 'Could not change your password. Please try again.',
      },
    );
    return detailMessage(body, 'Password changed.');
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

  replaceProfile(payload: UpdateProfilePayload): Promise<AuthUser> {
    return apiRequest<AuthUser>('/api/users/me/', {
      method: 'PUT',
      body: payload,
      auth: true,
      fallbackError: 'Could not replace your profile. Please try again.',
    });
  }

  getProfile(): Promise<AuthUser> {
    return apiRequest<AuthUser>('/api/users/me/', {
      method: 'GET',
      auth: true,
      fallbackError: 'Could not load your profile. Please try again.',
    });
  }

  async listInterestOptions(): Promise<string[]> {
    const body = await apiRequest<unknown>('/api/users/interests/', {
      method: 'GET',
      fallbackError: 'Could not load interests. Please try again.',
    });
    return parseInterestOptionsPayload(body);
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
