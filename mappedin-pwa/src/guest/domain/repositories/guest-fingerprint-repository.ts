import type { GuestFingerprintResponse } from '../entities';

/**
 * Contract for guest fingerprint backend operations.
 * Production will implement this with real HTTP; the app only depends on this interface.
 */
export interface GuestFingerprintRepository {
  /**
   * Check whether this browser fingerprint may continue as a guest.
   * Unknown visitors are typically registered on first contact.
   */
  validateGuestFingerprint(visitorId: string): Promise<GuestFingerprintResponse>;

  /** Explicitly register a new guest fingerprint (idempotent for existing ids). */
  registerGuestFingerprint(visitorId: string): Promise<GuestFingerprintResponse>;

  /**
   * Mark that this guest has exhausted free access (e.g. after a reset attempt).
   * Subsequent validate calls should deny with "Guest limit reached".
   */
  markGuestLimitReached(visitorId: string): Promise<GuestFingerprintResponse>;
}
