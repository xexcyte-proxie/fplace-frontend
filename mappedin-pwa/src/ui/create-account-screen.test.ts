import { describe, expect, it } from 'vitest';

import { renderCreateAccountScreen } from './create-account-screen';

describe('create account screen (guest CTA)', () => {
  it('renders Continue as guest when guest access is allowed', () => {
    const html = renderCreateAccountScreen({
      authEmail: '',
      authLoading: false,
      authFieldErrors: {},
      guestAccessAllowed: true,
      guestContinueLoading: false,
    });

    expect(html).toContain('id="auth-guest-btn"');
    expect(html).toContain('Continue as guest');
  });

  it('keeps Continue as guest when the fingerprint gate denies access', () => {
    const html = renderCreateAccountScreen({
      authEmail: '',
      authLoading: false,
      authFieldErrors: {},
      guestAccessAllowed: false,
      guestContinueLoading: false,
    });

    expect(html).toContain('id="auth-guest-btn"');
    expect(html).toContain('Continue as guest');
  });

  it('shows a circular spinner on Continue as guest while guest auth is in flight', () => {
    const html = renderCreateAccountScreen({
      authEmail: '',
      authLoading: true,
      authFieldErrors: {},
      guestAccessAllowed: true,
      guestContinueLoading: true,
    });
    expect(html).toContain('busy-indicator');
    expect(html).toContain('Continuing…');
    expect(html).not.toContain('Creating account…');
  });

  it('keeps create-account form hooks used by ui-root-events', () => {
    const html = renderCreateAccountScreen({
      authEmail: '',
      authLoading: false,
      authFieldErrors: {},
      guestAccessAllowed: true,
      guestContinueLoading: false,
    });
    expect(html).toContain('id="auth-back-btn"');
    expect(html).toContain('id="create-account-form"');
    expect(html).toContain('id="auth-email"');
    expect(html).toContain('id="auth-password"');
    expect(html).toContain('id="auth-password-confirm"');
    expect(html).toContain('id="auth-password-strength"');
    expect(html).toContain('id="auth-terms"');
    expect(html).toContain('id="auth-terms-link"');
    expect(html).toContain('id="auth-privacy-link"');
    expect(html).toContain('id="auth-continue-btn"');
    expect(html).toContain('id="auth-login-link"');
  });

  it('escapes email and field errors that look like HTML', () => {
    const html = renderCreateAccountScreen({
      authEmail: '"quoted"',
      authLoading: false,
      authFieldErrors: { email: '<b>bad</b>', _form: '<i>nope</i>' },
      guestAccessAllowed: true,
      guestContinueLoading: false,
    });
    expect(html).toContain('value="&quot;quoted&quot;"');
    expect(html).toContain('&lt;b&gt;bad&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;nope&lt;/i&gt;');
    expect(html).not.toContain('<b>bad</b>');
    expect(html).not.toContain('<i>nope</i>');
  });
});
