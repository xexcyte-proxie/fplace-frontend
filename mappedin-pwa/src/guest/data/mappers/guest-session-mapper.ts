import type {
  GuestMappedinCredentials,
  GuestSession,
  GuestSessionPreferences,
} from '../../domain/entities';

/** Raw JSON body from POST /api/users/guest/ (200). */
export interface GuestTokenApiResponse {
  access: string;
  token_type: string;
  expires_in: number;
  trial_started_at?: string | null;
  trial_expires_at?: string | null;
  has_tried_ar_view?: boolean;
  has_tried_2d_view?: boolean;
  mappedin: {
    token: string;
    expires_in: number;
  };
}

/** Raw JSON from GET/PATCH /api/users/guest/update/. */
export interface GuestSessionPreferencesApiResponse {
  has_tried_ar_view?: boolean;
  has_tried_2d_view?: boolean;
}

export function mapGuestTokenResponse(
  body: GuestTokenApiResponse,
  deviceFingerprint: string,
): GuestSession {
  if (!body?.access?.trim()) {
    throw new Error('Invalid guest response: missing access token.');
  }
  if (!body.mappedin?.token?.trim()) {
    throw new Error('Invalid guest response: missing MappedIn token.');
  }

  const mappedin: GuestMappedinCredentials = {
    token: body.mappedin.token,
    expiresIn: Number(body.mappedin.expires_in) || 0,
  };

  return {
    access: body.access,
    tokenType: 'guest',
    expiresIn: Number(body.expires_in) || 0,
    trialExpiresAt: body.trial_expires_at?.trim() || '',
    hasTriedArView: body.has_tried_ar_view === true,
    hasTried2dView: body.has_tried_2d_view === true,
    mappedin,
    deviceFingerprint,
  };
}

export function mapGuestSessionPreferences(
  body: GuestSessionPreferencesApiResponse | null | undefined,
): GuestSessionPreferences {
  return {
    hasTriedArView: body?.has_tried_ar_view === true,
    hasTried2dView: body?.has_tried_2d_view === true,
  };
}
