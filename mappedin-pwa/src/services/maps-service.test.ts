import { describe, expect, it } from 'vitest';

import {
  AuthApiError,
  isAuthCredentialFailure,
  isInvalidAccessTokenFailure,
} from '../auth/data/datasources/api-client';
import {
  extractMappedinAccessToken,
  mapIdFromMapsToken,
  toGetMapDataAuth,
} from './maps-service';

describe('toGetMapDataAuth', () => {
  it('uses the backend access token', () => {
    expect(
      toGetMapDataAuth({ accessToken: 'token-1', mapId: 'map-1' }),
    ).toEqual({ accessToken: 'token-1' });
  });
});

describe('mapIdFromMapsToken', () => {
  it('prefers the requested venue map id over the token payload', () => {
    expect(
      mapIdFromMapsToken({ token: 't', mapId: 'token-map' }, ' venue-map '),
    ).toBe('venue-map');
  });

  it('falls back to the token map id, then Demo Mall', () => {
    expect(mapIdFromMapsToken({ token: 't', mapId: 'token-map' }, null)).toBe(
      'token-map',
    );
    expect(mapIdFromMapsToken({ token: 't' }, '  ')).toBe(
      '65c0ff7430b94e3fabd5bb8c',
    );
  });
});

describe('extractMappedinAccessToken', () => {
  it('reads a top-level token', () => {
    expect(extractMappedinAccessToken({ token: 'abc' })).toBe('abc');
  });

  it('reads nested mappedin.token', () => {
    expect(
      extractMappedinAccessToken({
        mappedin: { token: 'nested', expires_in: 60 },
      }),
    ).toBe('nested');
  });

  it('returns null when missing', () => {
    expect(extractMappedinAccessToken({})).toBeNull();
  });
});

describe('isAuthCredentialFailure', () => {
  it('detects 401 AuthApiError', () => {
    expect(
      isAuthCredentialFailure(
        new AuthApiError({}, 'Unauthorized', 401),
      ),
    ).toBe(true);
  });

  it('detects the DRF credentials message', () => {
    expect(
      isAuthCredentialFailure(
        new Error(
          'Authentication credentials were not provided or are invalid. Please log in again.',
        ),
      ),
    ).toBe(true);
  });

  it('detects SimpleJWT token_not_valid as an invalid access token', () => {
    expect(
      isInvalidAccessTokenFailure(
        new AuthApiError(
          {
            detail: 'Given token not valid for any token type',
            code: 'token_not_valid',
          },
          'Unauthorized',
          401,
        ),
      ),
    ).toBe(true);
  });

  it('detects SimpleJWT nested under DRF details, not only top-level detail', () => {
    expect(
      isInvalidAccessTokenFailure(
        new AuthApiError(
          {
            status: 'error',
            message: 'Your session expired. Please log in again.',
            details: {
              detail: 'Given token not valid for any token type',
            },
          },
          'Unauthorized',
          401,
        ),
      ),
    ).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isAuthCredentialFailure(new Error('Map failed to load'))).toBe(
      false,
    );
  });
});
