import type {
  AuthSession,
  AuthTokens,
  AuthUser,
  ChangePasswordPayload,
  LoginCredentials,
  PasswordResetConfirmPayload,
  RegisterCredentials,
  UpdateProfilePayload,
} from '../domain/entities';
import type { AuthRepository } from '../domain/repositories/auth-repository';
import { authRemoteDatasource } from './datasources/auth-remote-datasource';
import { tokenLocalDatasource } from './datasources/token-local-datasource';

export class AuthRepositoryImpl implements AuthRepository {
  async register(credentials: RegisterCredentials): Promise<AuthUser> {
    return authRemoteDatasource.register(credentials);
  }

  async verifyEmail(email: string, otp: string): Promise<AuthUser> {
    return authRemoteDatasource.verifyEmail(email, otp);
  }

  async resendVerification(email: string): Promise<string> {
    return authRemoteDatasource.resendVerification(email);
  }

  async requestPasswordReset(email: string): Promise<string> {
    return authRemoteDatasource.requestPasswordReset(email);
  }

  async confirmPasswordReset(
    payload: PasswordResetConfirmPayload,
  ): Promise<string> {
    return authRemoteDatasource.confirmPasswordReset(payload);
  }

  async changePassword(payload: ChangePasswordPayload): Promise<string> {
    return authRemoteDatasource.changePassword(payload);
  }

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    const session = await authRemoteDatasource.login(credentials);
    tokenLocalDatasource.save({
      access: session.access,
      refresh: session.refresh,
    });
    return session;
  }

  async loginWithGoogle(idToken: string): Promise<AuthSession> {
    const session = await authRemoteDatasource.loginWithGoogle(idToken);
    tokenLocalDatasource.save({
      access: session.access,
      refresh: session.refresh,
    });
    return session;
  }

  async updateProfile(payload: UpdateProfilePayload): Promise<AuthUser> {
    return authRemoteDatasource.updateProfile(payload);
  }

  async replaceProfile(payload: UpdateProfilePayload): Promise<AuthUser> {
    return authRemoteDatasource.replaceProfile(payload);
  }

  async getProfile(): Promise<AuthUser> {
    return authRemoteDatasource.getProfile();
  }

  listInterestOptions(): Promise<string[]> {
    return authRemoteDatasource.listInterestOptions();
  }

  async refreshTokens(refresh: string): Promise<AuthTokens> {
    const tokens = await authRemoteDatasource.refreshTokens(refresh);
    tokenLocalDatasource.save({
      access: tokens.access,
      refresh: tokens.refresh || refresh,
    });
    return {
      access: tokens.access,
      refresh: tokens.refresh || refresh,
    };
  }

  async logout(refresh: string): Promise<void> {
    try {
      await authRemoteDatasource.logout(refresh);
    } finally {
      tokenLocalDatasource.clear();
    }
  }

  async deleteAccount(): Promise<void> {
    await authRemoteDatasource.deleteAccount();
    tokenLocalDatasource.clear();
  }
}

export const authRepository = new AuthRepositoryImpl();
