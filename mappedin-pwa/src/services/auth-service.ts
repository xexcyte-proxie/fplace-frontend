/**
 * Auth service façade - presentation and MapApp talk to this module only.
 * HTTP + token persistence live behind the auth repository (clean architecture).
 */
import type {
  AuthSession,
  AuthUser,
  ChangePasswordPayload,
  LoginCredentials,
  PasswordResetConfirmPayload,
  RegisterCredentials,
  UpdateProfilePayload,
  VenueSelection,
} from '../auth/domain/entities';
import {
  DEFAULT_DISPLAY_NAME,
  hasCompleteVenueSelection,
  resolveDisplayName,
  resolveOnboardingStep,
  userNeedsPseudoName,
} from '../auth/domain/entities';
import { authRepository } from '../auth/data/auth-repository-impl';
import { tokenLocalDatasource } from '../auth/data/datasources/token-local-datasource';
import { venuePreferenceLocalDatasource } from '../auth/data/datasources/venue-preference-local-datasource';
import {
  AuthApiError,
  onAuthSessionCleared,
} from '../auth/data/datasources/api-client';
import {
  isGoogleSignInConfigured,
  requestGoogleIdToken,
} from '../auth/data/google-auth';

export type {
  AuthSession,
  AuthUser,
  ChangePasswordPayload,
  PasswordResetConfirmPayload,
  UpdateProfilePayload,
  VenueSelection,
};
export type { AuthTokens, OnboardingStep } from '../auth/domain/entities';
export {
  AuthApiError,
  DEFAULT_DISPLAY_NAME,
  hasCompleteVenueSelection,
  onAuthSessionCleared,
  resolveDisplayName,
  resolveOnboardingStep,
  userNeedsPseudoName,
};
export { isGoogleSignInConfigured };

export interface RegisterPayload extends RegisterCredentials {}
export interface VerifyEmailPayload {
  email: string;
  otp: string;
}
export interface ResendVerificationPayload {
  email: string;
}
export interface LoginPayload extends LoginCredentials {}
export interface GoogleLoginPayload {
  id_token: string;
}

export function hasStoredAuthTokens(): boolean {
  return tokenLocalDatasource.load() !== null;
}

export function clearStoredAuthTokens(): void {
  tokenLocalDatasource.clear();
}

export function getStoredRefreshToken(): string | null {
  return tokenLocalDatasource.getRefreshToken();
}

export async function registerUser(
  payload: RegisterPayload,
): Promise<AuthUser> {
  return authRepository.register(payload);
}

export async function verifyEmail(
  email: string,
  otp: string,
): Promise<AuthUser> {
  return authRepository.verifyEmail(email, otp);
}

export async function resendVerification(email: string): Promise<string> {
  return authRepository.resendVerification(email);
}

/** Sends a password-reset email via POST /api/users/password-reset/. */
export async function requestPasswordReset(email: string): Promise<string> {
  return authRepository.requestPasswordReset(email);
}

/** Completes reset via POST /api/users/password-reset-confirm/. */
export async function confirmPasswordReset(
  payload: PasswordResetConfirmPayload,
): Promise<string> {
  return authRepository.confirmPasswordReset(payload);
}

/** Changes password via POST /api/users/change-password/. */
export async function changePassword(
  payload: ChangePasswordPayload,
): Promise<string> {
  return authRepository.changePassword(payload);
}

export async function loginUser(payload: LoginPayload): Promise<AuthSession> {
  return authRepository.login(payload);
}

export async function loginWithGoogle(
  idToken: string,
): Promise<AuthSession> {
  return authRepository.loginWithGoogle(idToken);
}

/** Obtains a Google ID token in the browser, then exchanges it for JWTs. */
export async function signInWithGoogle(): Promise<AuthSession> {
  const idToken = await requestGoogleIdToken();
  return loginWithGoogle(idToken);
}

export async function updateCurrentUser(
  payload: UpdateProfilePayload,
): Promise<AuthUser> {
  return authRepository.updateProfile(payload);
}

export async function replaceCurrentUser(
  payload: UpdateProfilePayload,
): Promise<AuthUser> {
  return authRepository.replaceProfile(payload);
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  return authRepository.getProfile();
}

export async function logoutUser(): Promise<void> {
  const refresh = tokenLocalDatasource.getRefreshToken();
  if (!refresh) {
    tokenLocalDatasource.clear();
    return;
  }
  await authRepository.logout(refresh);
}

export async function deleteCurrentAccount(): Promise<void> {
  await authRepository.deleteAccount();
}

export function loadVenueSelection(userId: number): VenueSelection | null {
  return venuePreferenceLocalDatasource.load(userId);
}

export function saveVenueSelection(
  userId: number,
  selection: VenueSelection,
): void {
  venuePreferenceLocalDatasource.save(userId, selection);
}

export function clearVenueSelection(userId: number): void {
  venuePreferenceLocalDatasource.clear(userId);
}
