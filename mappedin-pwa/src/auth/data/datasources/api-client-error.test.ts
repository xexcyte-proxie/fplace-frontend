import { describe, expect, it } from 'vitest';

import { AuthApiError } from './api-client';

describe('AuthApiError', () => {
  it('does not surface a bare 401 on the snackbar path', () => {
    const error = new AuthApiError(
      { detail: '401' },
      'Your session expired. Please log in again.',
      401,
    );
    expect(error.summary).toBe('Your session expired. Please log in again.');
    expect(error.message).toBe('Your session expired. Please log in again.');
  });

  it('keeps meaningful API detail text', () => {
    const error = new AuthApiError(
      { detail: 'Authentication credentials were not provided.' },
      'Your session expired. Please log in again.',
      401,
    );
    expect(error.summary).toBe(
      'Authentication credentials were not provided.',
    );
  });
});
