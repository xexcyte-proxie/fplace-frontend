import { describe, expect, it } from 'vitest';

import {
  guestDenialUserMessage,
  isGuestTrialExpiredReason,
} from '../../domain/entities';
import { mapGuestTokenResponse } from '../mappers/guest-session-mapper';

describe('mapGuestTokenResponse', () => {
  it('maps API payload into a GuestSession', () => {
    const session = mapGuestTokenResponse(
      {
        access: 'jwt-access',
        token_type: 'guest',
        expires_in: 3600,
        trial_expires_at: '2026-08-11T21:17:00Z',
        mappedin: { token: 'mi-token', expires_in: 1800 },
      },
      'fp_abc',
    );

    expect(session).toEqual({
      access: 'jwt-access',
      tokenType: 'guest',
      expiresIn: 3600,
      trialExpiresAt: '2026-08-11T21:17:00Z',
      hasTriedArView: false,
      hasTried2dView: false,
      mappedin: { token: 'mi-token', expiresIn: 1800 },
      deviceFingerprint: 'fp_abc',
    });
  });

  it('maps has_tried flags from the guest token response', () => {
    const session = mapGuestTokenResponse(
      {
        access: 'jwt-access',
        token_type: 'guest',
        expires_in: 3600,
        trial_expires_at: '2026-08-11T21:17:00Z',
        has_tried_ar_view: true,
        has_tried_2d_view: true,
        mappedin: { token: 'mi-token', expires_in: 1800 },
      },
      'fp_abc',
    );
    expect(session.hasTriedArView).toBe(true);
    expect(session.hasTried2dView).toBe(true);
  });

  it('maps API payload into a GuestSession when trial dates are null', () => {
    const session = mapGuestTokenResponse(
      {
        access: 'jwt-access',
        token_type: 'guest',
        expires_in: 3600,
        trial_started_at: null,
        trial_expires_at: null,
        mappedin: { token: 'mi-token', expires_in: 1800 },
      },
      'fp_abc',
    );
    expect(session.trialExpiresAt).toBe('');
    expect(session.mappedin.token).toBe('mi-token');
  });

  it('rejects incomplete payloads', () => {
    expect(() =>
      mapGuestTokenResponse(
        {
          access: '',
          token_type: 'guest',
          expires_in: 1,
          trial_expires_at: '2026-08-11T21:17:00Z',
          mappedin: { token: 'x', expires_in: 1 },
        },
        'fp',
      ),
    ).toThrow(/missing access/i);
  });
});

describe('guest denial messaging', () => {
  it('recognizes trial expiry reasons', () => {
    expect(isGuestTrialExpiredReason('Guest trial expired')).toBe(true);
    expect(isGuestTrialExpiredReason('Guest limit reached')).toBe(true);
    expect(isGuestTrialExpiredReason('network error')).toBe(false);
  });

  it('returns create-account copy for expired trials', () => {
    expect(guestDenialUserMessage('Guest trial expired')).toMatch(
      /guest trial has ended/i,
    );
  });
});
