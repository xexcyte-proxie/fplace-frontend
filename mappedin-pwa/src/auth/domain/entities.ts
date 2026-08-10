/** Authenticated app user returned by the fPlaces users API. */
export interface AuthUser {
  id: number;
  email: string;
  pseudo_name: string | null;
  first_name?: string;
  last_name?: string;
  bio?: string;
  avatar_url?: string | null;
  user_type?: 'regular_user' | 'admin';
  is_email_verified: boolean;
  interests?: string[] | null;
  created_at: string;
  updated_at: string;
}

/** Neutral fallback when `pseudo_name` is missing during incomplete onboarding. */
export const DEFAULT_DISPLAY_NAME = 'Guest';

/** Persisted venue + section choice for a completed onboarding step. */
export interface VenueSelection {
  venueId: string;
  sectionId: string;
}

export type OnboardingStep = 'pseudo-name' | 'venue-select' | 'home';

export function resolveDisplayName(
  user: Pick<AuthUser, 'pseudo_name'> | null | undefined,
): string {
  const name = user?.pseudo_name?.trim();
  return name || DEFAULT_DISPLAY_NAME;
}

export function userNeedsPseudoName(
  user: Pick<AuthUser, 'pseudo_name'> | null | undefined,
): boolean {
  return !user?.pseudo_name?.trim();
}

export function hasCompleteVenueSelection(
  selection: VenueSelection | null | undefined,
): boolean {
  return Boolean(selection?.venueId?.trim() && selection?.sectionId?.trim());
}

/** Profile-driven onboarding destination after authentication. */
export function resolveOnboardingStep(
  user: Pick<AuthUser, 'pseudo_name'> | null | undefined,
  selection: VenueSelection | null | undefined,
): OnboardingStep {
  if (userNeedsPseudoName(user)) return 'pseudo-name';
  if (!hasCompleteVenueSelection(selection)) return 'venue-select';
  return 'home';
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

/** Login / Google login response: JWT pair plus embedded profile. */
export interface AuthSession {
  access: string;
  refresh: string;
  user: AuthUser;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  password_confirm: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface UpdateProfilePayload {
  pseudo_name?: string | null;
  first_name?: string;
  last_name?: string;
  bio?: string;
  avatar_url?: string | null;
  interests?: string[] | null;
}

/** Body for POST /api/users/password-reset-confirm/. */
export interface PasswordResetConfirmPayload {
  uid: string;
  token: string;
  new_password: string;
}

/** Body for POST /api/users/change-password/. */
export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
}
