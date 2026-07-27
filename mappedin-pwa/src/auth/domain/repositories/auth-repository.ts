import type {
  AuthSession,
  AuthTokens,
  AuthUser,
  LoginCredentials,
  RegisterCredentials,
  UpdateProfilePayload,
} from '../entities';

export interface AuthRepository {
  register(credentials: RegisterCredentials): Promise<AuthUser>;
  verifyEmail(email: string, otp: string): Promise<AuthUser>;
  resendVerification(email: string): Promise<string>;
  login(credentials: LoginCredentials): Promise<AuthSession>;
  loginWithGoogle(idToken: string): Promise<AuthSession>;
  updateProfile(payload: UpdateProfilePayload): Promise<AuthUser>;
  getProfile(): Promise<AuthUser>;
  refreshTokens(refresh: string): Promise<AuthTokens>;
  logout(refresh: string): Promise<void>;
  deleteAccount(): Promise<void>;
}
