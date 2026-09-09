/**
 * Guest access façade - MapApp talks to this module only.
 * Combines FingerprintJS (browser id) with POST /api/users/guest/
 * and GET/PATCH /api/users/guest/update/.
 */
import type {
  GuestAccessDecision,
  GuestSession,
  GuestSessionPreferences,
} from '../guest/domain/entities';
import {
  createGuestAccessDecision,
  guestArAlreadyUsedMessage,
  guestArOneTimeTrialMessage,
  guestCanUseArTrial,
  guestDenialUserMessage,
  isGuestTrialExpiredReason,
} from '../guest/domain/entities';
import { guestRepository } from '../guest/data/guest-repository-impl';
import { guestFingerprintMockDatasource } from '../guest/data/datasources/guest-fingerprint-mock-datasource';
import { guestSessionLocalDatasource } from '../guest/data/datasources/guest-session-local-datasource';
import { tokenLocalDatasource } from '../auth/data/datasources/token-local-datasource';
import { fingerprintService } from './fingerprint-service';

export type {
  GuestAccessDecision,
  GuestDenialReason,
  GuestSession,
  GuestSessionPreferences,
} from '../guest/domain/entities';

/** @deprecated Use GuestAccessDecision. */
export type GuestFingerprintResponse = GuestAccessDecision;

export {
  guestArAlreadyUsedMessage,
  guestArOneTimeTrialMessage,
  guestCanUseArTrial,
  guestDenialUserMessage,
  isGuestTrialExpiredReason,
};

export interface GuestAccessResult extends GuestAccessDecision {
  visitorId: string;
}

/** Ensure FingerprintJS is loaded early (e.g. in parallel with map init). */
export function initializeFingerprint(): Promise<unknown> {
  return fingerprintService.initialize();
}

/** Generate (or return cached) browser visitorId via FingerprintJS. */
export async function getBrowserVisitorId(): Promise<string> {
  return fingerprintService.getVisitorId();
}

export function getCachedVisitorId(): string | null {
  return fingerprintService.getCachedVisitorId();
}

export function getStoredGuestSession(): GuestSession | null {
  return guestSessionLocalDatasource.load();
}

export function getStoredGuestMappedinToken(): string | null {
  return guestSessionLocalDatasource.getMappedinToken();
}

export function getGuestTrialExpiresAt(): string | null {
  return guestSessionLocalDatasource.getTrialExpiresAt();
}

export function getCachedGuestSessionPreferences(): GuestSessionPreferences {
  return guestSessionLocalDatasource.getPreferences();
}

/** True when the active access token is a guest JWT (not a registered user). */
export function isGuestMode(): boolean {
  return tokenLocalDatasource.isGuestToken();
}

/**
 * App-init entry: fingerprint the browser, then obtain/refresh a guest JWT
 * via POST /api/users/guest/. Authenticated (user) sessions skip the guest API
 * so we never overwrite registered-user tokens.
 *
 * Parallel callers (map credentials + auth bootstrap) share one in-flight request.
 */
let guestAccessInFlight: Promise<GuestAccessResult> | null = null;

export async function validateCurrentGuestAccess(): Promise<GuestAccessResult> {
  if (!guestAccessInFlight) {
    guestAccessInFlight = validateCurrentGuestAccessUncached().finally(() => {
      guestAccessInFlight = null;
    });
  }
  return guestAccessInFlight;
}

async function validateCurrentGuestAccessUncached(): Promise<GuestAccessResult> {
  const visitorId = await fingerprintService.getVisitorId();

  if (tokenLocalDatasource.load()) {
    return {
      ...createGuestAccessDecision({
        allowed: true,
        guestId: visitorId,
        reason: null,
        session: guestSessionLocalDatasource.load() ?? undefined,
      }),
      visitorId,
    };
  }

  const response = await guestRepository.validateGuestFingerprint(visitorId);
  return { ...response, visitorId };
}

export async function registerCurrentGuestFingerprint(): Promise<GuestAccessResult> {
  const visitorId = await fingerprintService.getVisitorId();
  const response = await guestRepository.registerGuestFingerprint(visitorId);
  return { ...response, visitorId };
}

/**
 * Mark the current browser fingerprint as having exhausted guest access.
 * Clears guest JWT / MappedIn credentials and records a local denial.
 */
export async function markCurrentGuestLimitReached(): Promise<GuestAccessResult> {
  const visitorId = await fingerprintService.getVisitorId();
  const response = await guestRepository.markGuestLimitReached(visitorId);
  return { ...response, visitorId };
}

export function validateGuestFingerprint(
  visitorId: string,
): Promise<GuestAccessDecision> {
  return guestRepository.validateGuestFingerprint(visitorId);
}

export function registerGuestFingerprint(
  visitorId: string,
): Promise<GuestAccessDecision> {
  return guestRepository.registerGuestFingerprint(visitorId);
}

export function markGuestLimitReached(
  visitorId: string,
): Promise<GuestAccessDecision> {
  return guestRepository.markGuestLimitReached(visitorId);
}

/** Refresh AR / 2D trial flags from GET /api/users/guest/update/. */
export async function fetchGuestSessionPreferences(): Promise<GuestSessionPreferences> {
  return guestRepository.getSessionPreferences();
}

/** PATCH has_tried_ar_view=true as soon as the guest enters AR. */
export async function markGuestArViewTried(): Promise<GuestSessionPreferences> {
  return guestRepository.updateSessionPreferences({ hasTriedArView: true });
}

/** PATCH has_tried_2d_view=true as soon as the guest opens the 2D map. */
export async function markGuest2dViewTried(): Promise<GuestSessionPreferences> {
  return guestRepository.updateSessionPreferences({ hasTried2dView: true });
}

/**
 * Resolve whether a guest may still open AR, preferring a fresh backend read.
 * Falls back to cached session flags if the update endpoint is unreachable.
 */
export async function resolveGuestArEligibility(): Promise<{
  allowed: boolean;
  preferences: GuestSessionPreferences;
}> {
  try {
    const preferences = await fetchGuestSessionPreferences();
    return {
      allowed: guestCanUseArTrial(preferences),
      preferences,
    };
  } catch {
    const preferences = getCachedGuestSessionPreferences();
    return {
      allowed: guestCanUseArTrial(preferences),
      preferences,
    };
  }
}

/** Dev/test helpers for the mock denial store + guest session cache. */
export function clearMockGuestFingerprintRecords(): void {
  guestFingerprintMockDatasource.clearAll();
  guestSessionLocalDatasource.clear();
}

export function listMockGuestFingerprintRecords() {
  return guestFingerprintMockDatasource.listRecords();
}
