import { describe, expect, it } from 'vitest';

import {
  AuthApiError,
  isAuthCredentialFailure,
} from '../auth/data/datasources/api-client';
import {
  extractMappedinAccessToken,
  localMappedinCredentialsFromConfig,
  toGetMapDataAuth,
} from './maps-service';

describe('localMappedinCredentialsFromConfig', () => {
  it('returns key/secret when all three values are present', () => {
    expect(
      localMappedinCredentialsFromConfig({
        key: ' mik_test ',
        secret: ' mis_test ',
        mapId: ' map-1 ',
      }),
    ).toEqual({ key: 'mik_test', secret: 'mis_test', mapId: 'map-1' });
  });

  it('returns null when the local override is incomplete', () => {
    expect(
      localMappedinCredentialsFromConfig({
        key: 'mik_test',
        secret: '',
        mapId: 'map-1',
      }),
    ).toBeNull();
  });
});

describe('toGetMapDataAuth', () => {
  it('prefers local key/secret', () => {
    expect(
      toGetMapDataAuth({
        key: 'mik_test',
        secret: 'mis_test',
        mapId: 'map-1',
      }),
    ).toEqual({ key: 'mik_test', secret: 'mis_test' });
  });

  it('uses a backend access token when no key/secret is set', () => {
    expect(
      toGetMapDataAuth({ accessToken: 'token-1', mapId: 'map-1' }),
    ).toEqual({ accessToken: 'token-1' });
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

  it('ignores unrelated errors', () => {
    expect(isAuthCredentialFailure(new Error('Map failed to load'))).toBe(
      false,
    );
  });
});
