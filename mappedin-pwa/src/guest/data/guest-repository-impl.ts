import { AuthApiError } from '../../auth/data/datasources/api-client';
import { tokenLocalDatasource } from '../../auth/data/datasources/token-local-datasource';
import type {
  GuestAccessDecision,
  GuestSessionPreferences,
  GuestSessionPreferencesUpdate,
  GuestTokenRequest,
} from '../domain/entities';
import { createGuestAccessDecision } from '../domain/entities';
import type { GuestRepository } from '../domain/repositories/guest-repository';
import { resolveClientIpAddress } from './datasources/client-ip-datasource';
import { guestRemoteDatasource } from './datasources/guest-remote-datasource';
import { guestSessionLocalDatasource } from './datasources/guest-session-local-datasource';
import { guestFingerprintMockDatasource } from './datasources/guest-fingerprint-mock-datasource';
import {
  mapGuestSessionPreferences,
  mapGuestTokenResponse,
} from './mappers/guest-session-mapper';

/**
 * Guest repository - production uses POST /api/users/guest/
 * and GET/PATCH /api/users/guest/update/.
 */
export class GuestRepositoryImpl implements GuestRepository {
  async obtainGuestSession(
    request: GuestTokenRequest,
  ): Promise<GuestAccessDecision> {
    const fingerprint = request.deviceFingerprint.trim();
    if (!fingerprint) {
      throw new Error('device_fingerprint is required');
    }

    try {
      const raw = await guestRemoteDatasource.obtainGuestToken({
        ip_address: request.ipAddress.trim() || '0.0.0.0',
        device_fingerprint: fingerprint,
      });
      const session = mapGuestTokenResponse(raw, fingerprint);
      guestSessionLocalDatasource.save(session);
      tokenLocalDatasource.saveGuestAccess(session.access);

      return createGuestAccessDecision({
        allowed: true,
        guestId: fingerprint,
        reason: null,
        session,
      });
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 403) {
        this.clearGuestCredentials();
        return createGuestAccessDecision({
          allowed: false,
          guestId: fingerprint,
          reason: 'Guest trial expired',
        });
      }
      throw error;
    }
  }

  async validateGuestFingerprint(
    visitorId: string,
  ): Promise<GuestAccessDecision> {
    if (this.isDevForcedLimit(visitorId)) {
      this.clearGuestCredentials();
      return createGuestAccessDecision({
        allowed: false,
        guestId: visitorId,
        reason: 'Guest limit reached',
      });
    }

    if (guestSessionLocalDatasource.isTrialExpired()) {
      this.clearGuestCredentials();
      return createGuestAccessDecision({
        allowed: false,
        guestId: visitorId,
        reason: 'Guest trial expired',
      });
    }

    const ipAddress = await resolveClientIpAddress();
    return this.obtainGuestSession({
      deviceFingerprint: visitorId,
      ipAddress,
    });
  }

  async registerGuestFingerprint(
    visitorId: string,
  ): Promise<GuestAccessDecision> {
    return this.validateGuestFingerprint(visitorId);
  }

  async markGuestLimitReached(
    visitorId: string,
  ): Promise<GuestAccessDecision> {
    this.clearGuestCredentials();
    return guestFingerprintMockDatasource.markGuestLimitReached(visitorId);
  }

  async getSessionPreferences(): Promise<GuestSessionPreferences> {
    const remote = mapGuestSessionPreferences(
      await guestRemoteDatasource.getSessionPreferences(),
    );
    guestSessionLocalDatasource.patchPreferences(remote);
    return remote;
  }

  async updateSessionPreferences(
    update: GuestSessionPreferencesUpdate,
  ): Promise<GuestSessionPreferences> {
    const body: {
      has_tried_ar_view?: boolean;
      has_tried_2d_view?: boolean;
    } = {};
    if (typeof update.hasTriedArView === 'boolean') {
      body.has_tried_ar_view = update.hasTriedArView;
    }
    if (typeof update.hasTried2dView === 'boolean') {
      body.has_tried_2d_view = update.hasTried2dView;
    }

    const raw = await guestRemoteDatasource.updateSessionPreferences(body);
    const preferences =
      raw && typeof raw === 'object'
        ? mapGuestSessionPreferences(raw)
        : {
            hasTriedArView:
              update.hasTriedArView ??
              guestSessionLocalDatasource.getPreferences().hasTriedArView,
            hasTried2dView:
              update.hasTried2dView ??
              guestSessionLocalDatasource.getPreferences().hasTried2dView,
          };

    guestSessionLocalDatasource.patchPreferences(preferences);
    return preferences;
  }

  private isDevForcedLimit(visitorId: string): boolean {
    const records = guestFingerprintMockDatasource.listRecords();
    const match = records.find((record) => record.visitorId === visitorId);
    return Boolean(match?.limitReached);
  }

  private clearGuestCredentials(): void {
    guestSessionLocalDatasource.clear();
    tokenLocalDatasource.clearGuestAccess();
  }
}

export const guestRepository = new GuestRepositoryImpl();

/** @deprecated Prefer guestRepository. */
export const guestFingerprintRepository = guestRepository;
