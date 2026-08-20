/**
 * Guest access domain - POST /api/users/guest/
 * Framework-agnostic entities and helpers.
 */

/** Denial reasons for the guest trial / fingerprint gate. */
export type GuestDenialReason =
  | 'Guest limit reached'
  | 'Guest trial expired'
  | (string & {});

/**
 * Successful guest token response from POST /api/users/guest/.
 * `access` is a JWT with `token_type=guest` for IsAuthenticatedOrGuest APIs.
 */
export interface GuestSession {
  access: string;
  tokenType: 'guest';
  /** Access token lifetime in seconds (default ~60 min). */
  expiresIn: number;
  /** ISO-8601 end of the device trial window (may be empty if backend omits it). */
  trialExpiresAt: string;
  /** One-time AR trial already consumed for this fingerprint. */
  hasTriedArView: boolean;
  /** One-time 2D map trial already consumed for this fingerprint. */
  hasTried2dView: boolean;
  mappedin: GuestMappedinCredentials;
  /** Fingerprint used to obtain this session. */
  deviceFingerprint: string;
}

/** Preferences from GET/PATCH /api/users/guest/update/. */
export interface GuestSessionPreferences {
  hasTriedArView: boolean;
  hasTried2dView: boolean;
}

export interface GuestSessionPreferencesUpdate {
  hasTriedArView?: boolean;
  hasTried2dView?: boolean;
}

export interface GuestMappedinCredentials {
  token: string;
  expiresIn: number;
}

export interface GuestTokenRequest {
  ipAddress: string;
  deviceFingerprint: string;
}

/**
 * App-facing gate result (maps onto existing UI: Continue as guest / denial).
 * On success, `session` holds the JWT + MappedIn credentials.
 */
export interface GuestAccessDecision {
  allowed: boolean;
  /** Stable id for returning-session snapshots (fingerprint). */
  guestId?: string;
  reason: GuestDenialReason | null;
  session?: GuestSession;
}

/** @deprecated Prefer GuestAccessDecision - kept for mock / gradual migration. */
export type GuestFingerprintResponse = GuestAccessDecision;

/** Persisted mock record (DEV helpers only). */
export interface GuestFingerprintRecord {
  visitorId: string;
  guestId: string;
  createdAt: string;
  limitReached: boolean;
  lastSeenAt: string;
}

export function createGuestAccessDecision(
  partial: GuestAccessDecision,
): GuestAccessDecision {
  return {
    allowed: partial.allowed,
    guestId: partial.guestId,
    reason: partial.reason ?? null,
    session: partial.session,
  };
}

/** Alias used by older call sites. */
export const createGuestFingerprintResponse = createGuestAccessDecision;

/** Guest may open AR only while backend `has_tried_ar_view` is false. */
export function guestCanUseArTrial(
  preferences: Pick<GuestSessionPreferences, 'hasTriedArView'>,
): boolean {
  return preferences.hasTriedArView !== true;
}

export function isGuestTrialExpiredReason(
  reason: string | null | undefined,
): boolean {
  if (!reason) return false;
  const normalized = reason.toLowerCase();
  return (
    normalized.includes('trial') ||
    normalized === 'guest limit reached' ||
    normalized.includes('expired')
  );
}

export function guestDenialUserMessage(reason: string | null | undefined): string {
  if (!reason) {
    return 'Guest access is not available on this device.';
  }
  if (isGuestTrialExpiredReason(reason)) {
    return 'Your guest trial has ended on this device. Create an account to continue.';
  }
  return reason;
}

export function guestArAlreadyUsedMessage(): string {
  return 'Your free AR trial has already been used on this device. Create an account to keep using AR navigation.';
}

export function guestArOneTimeTrialMessage(): string {
  return 'Guests get one free AR trial on this device. Opening AR uses that trial.';
}
