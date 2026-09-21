import { describe, expect, it } from 'vitest';

import { authFieldError } from './auth-field-error';

describe('authFieldError', () => {
  it('returns the message for a key or an empty string', () => {
    expect(authFieldError({ email: 'Required' }, 'email')).toBe('Required');
    expect(authFieldError({ email: 'Required' }, 'password')).toBe('');
  });
});
