import { describe, expect, it } from 'vitest';

import {
  isTechnicalHttpErrorMessage,
  resolveUserFacingApiErrorMessage,
} from './user-facing-api-error';

describe('isTechnicalHttpErrorMessage', () => {
  it('flags bare status codes and common HTTP phrases', () => {
    expect(isTechnicalHttpErrorMessage('401')).toBe(true);
    expect(isTechnicalHttpErrorMessage(' 403 ')).toBe(true);
    expect(isTechnicalHttpErrorMessage('Unauthorized')).toBe(true);
    expect(isTechnicalHttpErrorMessage('HTTP 401')).toBe(true);
    expect(isTechnicalHttpErrorMessage('http:502')).toBe(true);
  });

  it('keeps real user-facing copy', () => {
    expect(
      isTechnicalHttpErrorMessage('Your session expired. Please log in again.'),
    ).toBe(false);
    expect(
      isTechnicalHttpErrorMessage('Authentication credentials were not provided.'),
    ).toBe(false);
  });
});

describe('resolveUserFacingApiErrorMessage', () => {
  const fallback = 'Your session expired. Please log in again.';

  it('replaces a bare 401 with the fallback', () => {
    expect(resolveUserFacingApiErrorMessage('401', fallback)).toBe(fallback);
    expect(resolveUserFacingApiErrorMessage('Unauthorized', fallback)).toBe(
      fallback,
    );
    expect(resolveUserFacingApiErrorMessage('', fallback)).toBe(fallback);
    expect(resolveUserFacingApiErrorMessage(null, fallback)).toBe(fallback);
  });

  it('keeps a meaningful server message', () => {
    expect(
      resolveUserFacingApiErrorMessage(
        'Authentication credentials were not provided.',
        fallback,
      ),
    ).toBe('Authentication credentials were not provided.');
  });
});
