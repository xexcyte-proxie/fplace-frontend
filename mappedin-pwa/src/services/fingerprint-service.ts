/**
 * FingerprintService — browser fingerprinting only (FingerprintJS).
 * Does not talk to any backend; guest API calls live in guest-access-service.
 */
import FingerprintJS, { type Agent } from '@fingerprintjs/fingerprintjs';

export class FingerprintService {
  private agentPromise: Promise<Agent> | null = null;
  private cachedVisitorId: string | null = null;

  /**
   * Eagerly load the FingerprintJS agent. Safe to call multiple times;
   * subsequent calls reuse the same initialization promise.
   */
  initialize(): Promise<Agent> {
    if (!this.agentPromise) {
      this.agentPromise = FingerprintJS.load({ monitoring: false });
    }
    return this.agentPromise;
  }

  /**
   * Resolve the stable browser visitorId.
   * Results are cached for the lifetime of this page session.
   */
  async getVisitorId(): Promise<string> {
    if (this.cachedVisitorId) {
      return this.cachedVisitorId;
    }

    const agent = await this.initialize();
    const result = await agent.get();
    this.cachedVisitorId = result.visitorId;
    return this.cachedVisitorId;
  }

  /** Return the last resolved visitorId without triggering a new scan. */
  getCachedVisitorId(): string | null {
    return this.cachedVisitorId;
  }

  /** Clear the in-memory cache (does not affect FingerprintJS itself). */
  clearCache(): void {
    this.cachedVisitorId = null;
  }
}

export const fingerprintService = new FingerprintService();
