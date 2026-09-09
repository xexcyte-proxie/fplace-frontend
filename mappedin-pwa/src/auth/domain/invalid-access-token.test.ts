import { describe, expect, it } from 'vitest';

import {
  invalidTokenCreateAccountCopy,
  isTokenNotValidForAnyType,
  containsTokenNotValidDetail,
  shouldDeferSessionRecoveryUi,
} from './invalid-access-token';

describe('isTokenNotValidForAnyType', () => {
  it('matches the SimpleJWT detail string', () => {
    expect(
      isTokenNotValidForAnyType('Given token not valid for any token type'),
    ).toBe(true);
  });

  it('matches the SimpleJWT code', () => {
    expect(isTokenNotValidForAnyType('token_not_valid')).toBe(true);
  });

  it('ignores unrelated auth errors', () => {
    expect(
      isTokenNotValidForAnyType(
        'Authentication credentials were not provided.',
      ),
    ).toBe(false);
    expect(isTokenNotValidForAnyType('')).toBe(false);
    expect(isTokenNotValidForAnyType(null)).toBe(false);
  });

  it('finds the SimpleJWT detail nested in a DRF error envelope', () => {
    expect(
      containsTokenNotValidDetail({
        status: 'error',
        message: 'Your session expired. Please log in again.',
        details: {
          detail: ['Given token not valid for any token type'],
        },
      }),
    ).toBe(true);
    expect(
      containsTokenNotValidDetail({
        messages: [
          {
            token_class: 'AccessToken',
            token_type: 'access',
            message: 'Given token not valid for any token type',
          },
        ],
      }),
    ).toBe(true);
    expect(
      containsTokenNotValidDetail({
        status: 'error',
        message: 'Your session expired. Please log in again.',
      }),
    ).toBe(false);
  });
});

describe('shouldDeferSessionRecoveryUi', () => {
  it('defers only before any auth shell or bootstrap has run', () => {
    expect(
      shouldDeferSessionRecoveryUi({
        startupReady: false,
        authShellVisible: false,
        authFlowBootstrapped: false,
      }),
    ).toBe(true);
  });

  it('applies immediately once Welcome back or another shell is already on screen', () => {
    expect(
      shouldDeferSessionRecoveryUi({
        startupReady: false,
        authShellVisible: true,
        authFlowBootstrapped: false,
      }),
    ).toBe(false);
    expect(
      shouldDeferSessionRecoveryUi({
        startupReady: false,
        authShellVisible: false,
        authFlowBootstrapped: true,
      }),
    ).toBe(false);
  });
});

describe('invalidTokenCreateAccountCopy', () => {
  it('tells the user to create an account', () => {
    const copy = invalidTokenCreateAccountCopy();
    expect(copy.title).toMatch(/create an account/i);
    expect(copy.body).toMatch(/session is no longer valid/i);
  });
});
