import type {
  GuestAccessDecision,
  GuestSessionPreferences,
  GuestSessionPreferencesUpdate,
  GuestTokenRequest,
} from '../entities';

/**
 * Guest token repository - production talks to POST /api/users/guest/
 * and GET/PATCH /api/users/guest/update/.
 */
export interface GuestRepository {
  /**
   * Obtain or refresh a guest JWT within the trial window for this fingerprint.
   * First call starts the trial clock; later calls re-issue access without resetting it.
   * Trial expiry surfaces as `allowed: false`.
   */
  obtainGuestSession(request: GuestTokenRequest): Promise<GuestAccessDecision>;

  /**
   * Validate / refresh guest access for a known fingerprint (same as obtain).
   * Used at app bootstrap before Continue as guest.
   */
  validateGuestFingerprint(visitorId: string): Promise<GuestAccessDecision>;

  /** Explicit guest registration path (Continue as guest CTA). */
  registerGuestFingerprint(visitorId: string): Promise<GuestAccessDecision>;

  /**
   * Locally mark this device as exhausted (DEV / forced signup).
   * Production denial is driven by HTTP 403 from obtainGuestSession.
   */
  markGuestLimitReached(visitorId: string): Promise<GuestAccessDecision>;

  /** GET /api/users/guest/update/ - current AR / 2D trial flags. */
  getSessionPreferences(): Promise<GuestSessionPreferences>;

  /** PATCH /api/users/guest/update/ - consume AR / 2D one-time trials. */
  updateSessionPreferences(
    update: GuestSessionPreferencesUpdate,
  ): Promise<GuestSessionPreferences>;
}

/** @deprecated Use GuestRepository. */
export type GuestFingerprintRepository = GuestRepository;
