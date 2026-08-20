import { describe, expect, it } from 'vitest';

import {
  AuthApiError,
  isAuthCredentialFailure,
} from '../auth/data/datasources/api-client';
import { extractMappedinAccessToken } from './maps-service';

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
