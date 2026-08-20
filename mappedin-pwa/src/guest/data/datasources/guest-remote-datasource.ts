import {
  apiRequest,
  AuthApiError,
} from '../../../auth/data/datasources/api-client';
import type {
  GuestSessionPreferencesApiResponse,
  GuestTokenApiResponse,
} from '../mappers/guest-session-mapper';

/**
 * Remote datasource for guest auth + trial preference endpoints.
 */
export class GuestRemoteDatasource {
  obtainGuestToken(input: {
    ip_address: string;
    device_fingerprint: string;
  }): Promise<GuestTokenApiResponse> {
    return apiRequest<GuestTokenApiResponse>('/api/users/guest/', {
      method: 'POST',
      body: input,
      auth: false,
      skipRefresh: true,
      fallbackError: 'Could not start a guest session. Please try again.',
    });
  }

  /** GET /api/users/guest/update/ - requires guest (or user) bearer. */
  getSessionPreferences(): Promise<GuestSessionPreferencesApiResponse> {
    return apiRequest<GuestSessionPreferencesApiResponse>(
      '/api/users/guest/update/',
      {
        method: 'GET',
        auth: true,
        skipRefresh: true,
        fallbackError: 'Could not load guest trial status.',
      },
    );
  }

  /** PATCH /api/users/guest/update/ - mark AR / 2D trial consumed. */
  updateSessionPreferences(body: {
    has_tried_ar_view?: boolean;
    has_tried_2d_view?: boolean;
  }): Promise<GuestSessionPreferencesApiResponse | void> {
    return apiRequest<GuestSessionPreferencesApiResponse | void>(
      '/api/users/guest/update/',
      {
        method: 'PATCH',
        body,
        auth: true,
        skipRefresh: true,
        fallbackError: 'Could not update guest trial status.',
      },
    );
  }
}

export { AuthApiError };

export const guestRemoteDatasource = new GuestRemoteDatasource();
