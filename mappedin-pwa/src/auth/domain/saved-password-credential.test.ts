import { describe, expect, it } from 'vitest';

import { isUsableSavedPasswordCredential } from './saved-password-credential';

describe('isUsableSavedPasswordCredential', () => {
  it('accepts a non-empty email and password', () => {
    expect(
      isUsableSavedPasswordCredential({
        email: ' fan@email.com ',
        password: 'secret',
      }),
    ).toBe(true);
  });

  it('rejects missing or blank fields', () => {
    expect(isUsableSavedPasswordCredential(null)).toBe(false);
    expect(
      isUsableSavedPasswordCredential({ email: '  ', password: 'secret' }),
    ).toBe(false);
    expect(
      isUsableSavedPasswordCredential({
        email: 'fan@email.com',
        password: '',
      }),
    ).toBe(false);
  });
});
