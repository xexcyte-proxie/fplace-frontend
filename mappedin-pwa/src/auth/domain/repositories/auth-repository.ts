import type {
  AuthSession,
  AuthTokens,
  AuthUser,
  ChangePasswordPayload,
  LoginCredentials,
  PasswordResetConfirmPayload,
  RegisterCredentials,
  UpdateProfilePayload,
} from '../entities';

export interface AuthRepository {
  register(credentials: RegisterCredentials): Promise<AuthUser>;
  verifyEmail(email: string, otp: string): Promise<AuthUser>;
  resendVerification(email: string): Promise<string>;
  /** Request a password-reset email for the given address. */
  requestPasswordReset(email: string): Promise<string>;
  /** Complete reset with uid/token from the email link. */
  confirmPasswordReset(payload: PasswordResetConfirmPayload): Promise<string>;
  /** Change password for the authenticated user. */
  changePassword(payload: ChangePasswordPayload): Promise<string>;
  login(credentials: LoginCredentials): Promise<AuthSession>;
  loginWithGoogle(idToken: string): Promise<AuthSession>;
  updateProfile(payload: UpdateProfilePayload): Promise<AuthUser>;
  /** Full replace via PUT /api/users/me/. */
  replaceProfile(payload: UpdateProfilePayload): Promise<AuthUser>;
  getProfile(): Promise<AuthUser>;
  /** Catalog of interest chips: GET /api/users/interests/. */
  listInterestOptions(): Promise<string[]>;
  refreshTokens(refresh: string): Promise<AuthTokens>;
  logout(refresh: string): Promise<void>;
  deleteAccount(): Promise<void>;
}
