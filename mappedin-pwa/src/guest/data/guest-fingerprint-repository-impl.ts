import type { GuestFingerprintResponse } from '../domain/entities';
import type { GuestFingerprintRepository } from '../domain/repositories/guest-fingerprint-repository';
import { guestFingerprintMockDatasource } from './datasources/guest-fingerprint-mock-datasource';

/**
 * Guest fingerprint repository — currently backed by the in-memory mock.
 * Swap the datasource for a remote HTTP implementation when the API is ready.
 */
export class GuestFingerprintRepositoryImpl
  implements GuestFingerprintRepository
{
  validateGuestFingerprint(
    visitorId: string,
  ): Promise<GuestFingerprintResponse> {
    return guestFingerprintMockDatasource.validateGuestFingerprint(visitorId);
  }

  registerGuestFingerprint(
    visitorId: string,
  ): Promise<GuestFingerprintResponse> {
    return guestFingerprintMockDatasource.registerGuestFingerprint(visitorId);
  }

  markGuestLimitReached(
    visitorId: string,
  ): Promise<GuestFingerprintResponse> {
    return guestFingerprintMockDatasource.markGuestLimitReached(visitorId);
  }
}

export const guestFingerprintRepository = new GuestFingerprintRepositoryImpl();
