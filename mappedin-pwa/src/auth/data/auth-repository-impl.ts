import type {
  AuthSession,
  AuthTokens,
  AuthUser,
  LoginCredentials,
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

  async getProfile(): Promise<AuthUser> {
    return authRemoteDatasource.getProfile();
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
