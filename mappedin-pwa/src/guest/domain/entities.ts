/**
 * Guest fingerprint domain entities.
 * Framework-agnostic — no FingerprintJS or HTTP here.
 */

/** Denial reasons returned by the guest fingerprint API. */
export type GuestDenialReason = 'Guest limit reached' | (string & {});

/**
 * Response shape for guest fingerprint validation / registration.
 * Matches the future backend contract so the mock can be swapped for HTTP.
 */
export interface GuestFingerprintResponse {
  allowed: boolean;
  guestId?: string;
  reason: GuestDenialReason | null;
}

/** Persisted mock/backend guest record keyed by browser visitorId. */
export interface GuestFingerprintRecord {
  visitorId: string;
  guestId: string;
  createdAt: string;
  /** When true, further guest access is denied until the user creates an account. */
  limitReached: boolean;
  lastSeenAt: string;
}

export function createGuestFingerprintResponse(
  partial: GuestFingerprintResponse,
): GuestFingerprintResponse {
  return {
    allowed: partial.allowed,
    guestId: partial.guestId,
    reason: partial.reason ?? null,
  };
}
