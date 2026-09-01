import { describe, expect, it } from 'vitest';

import { renderCreateAccountScreen } from './create-account-screen';

describe('create account screen (guest CTA)', () => {
  it('renders Continue as guest when guest access is allowed', () => {
    const html = renderCreateAccountScreen({
      authEmail: '',
      authLoading: false,
      authFieldErrors: {},
      guestAccessAllowed: true,
    });

    expect(html).toContain('id="auth-guest-btn"');
    expect(html).toContain('Continue as guest');
  });

  it('hides Continue as guest when the fingerprint gate denies access', () => {
    const html = renderCreateAccountScreen({
      authEmail: '',
      authLoading: false,
      authFieldErrors: {},
      guestAccessAllowed: false,
    });

    expect(html).not.toContain('id="auth-guest-btn"');
    expect(html).not.toContain('Continue as guest');
  });
});
