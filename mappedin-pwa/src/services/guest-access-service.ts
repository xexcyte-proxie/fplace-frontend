/**
 * Guest access façade — MapApp talks to this module only.
 * Combines FingerprintService (browser id) with the guest fingerprint repository
 * (mock today, real HTTP later) without mixing those concerns.
 */
import type { GuestFingerprintResponse } from '../guest/domain/entities';
import { guestFingerprintRepository } from '../guest/data/guest-fingerprint-repository-impl';
import { guestFingerprintMockDatasource } from '../guest/data/datasources/guest-fingerprint-mock-datasource';
import { fingerprintService } from './fingerprint-service';

export type { GuestFingerprintResponse, GuestDenialReason } from '../guest/domain/entities';

export interface GuestAccessResult extends GuestFingerprintResponse {
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

/**
 * App-init entry: fingerprint the browser, then validate guest access
 * against the (mock) backend. Authenticated session restore can still
 * run afterward; this gates anonymous / guest entry.
 */
export async function validateCurrentGuestAccess(): Promise<GuestAccessResult> {
  const visitorId = await fingerprintService.getVisitorId();
  const response =
    await guestFingerprintRepository.validateGuestFingerprint(visitorId);
  return { ...response, visitorId };
}

export async function registerCurrentGuestFingerprint(): Promise<GuestAccessResult> {
  const visitorId = await fingerprintService.getVisitorId();
  const response =
    await guestFingerprintRepository.registerGuestFingerprint(visitorId);
  return { ...response, visitorId };
}

/**
 * Mark the current browser fingerprint as having exhausted guest access.
 * Call when a guest session ends / is reset so a later visit is denied.
 */
export async function markCurrentGuestLimitReached(): Promise<GuestAccessResult> {
  const visitorId = await fingerprintService.getVisitorId();
  const response =
    await guestFingerprintRepository.markGuestLimitReached(visitorId);
  return { ...response, visitorId };
}

/** Explicit visitorId variants — useful when the id is already known. */
export function validateGuestFingerprint(
  visitorId: string,
): Promise<GuestFingerprintResponse> {
  return guestFingerprintRepository.validateGuestFingerprint(visitorId);
}

export function registerGuestFingerprint(
  visitorId: string,
): Promise<GuestFingerprintResponse> {
  return guestFingerprintRepository.registerGuestFingerprint(visitorId);
}

export function markGuestLimitReached(
  visitorId: string,
): Promise<GuestFingerprintResponse> {
  return guestFingerprintRepository.markGuestLimitReached(visitorId);
}

/**
 * Dev/test helpers for the mock store. No-ops conceptually once a real
 * remote datasource replaces the mock (remove or gate behind DEV).
 */
export function clearMockGuestFingerprintRecords(): void {
  guestFingerprintMockDatasource.clearAll();
}

export function listMockGuestFingerprintRecords() {
  return guestFingerprintMockDatasource.listRecords();
}
