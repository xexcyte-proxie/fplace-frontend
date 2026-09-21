import { describe, expect, it } from 'vitest';

import { renderCheckEmailScreen } from './check-email-screen';

describe('renderCheckEmailScreen', () => {
  it('keeps verify check-email hooks used by ui-root-events', () => {
    const html = renderCheckEmailScreen({
      authEmail: 'fan@email.com',
      authLoading: false,
    });
    expect(html).toContain('id="check-email-back-btn"');
    expect(html).toContain('id="check-email-resend-btn"');
    expect(html).toContain('Check your email');
    expect(html).toContain('We sent a verification link and code to');
    expect(html).not.toContain('id="check-email-login-link"');
  });

  it('shows password-reset copy and the back-to-login hook', () => {
    const html = renderCheckEmailScreen({
      authEmail: 'fan@email.com',
      authLoading: false,
      checkEmailPurpose: 'password-reset',
    });
    expect(html).toContain('We sent a password reset link to');
    expect(html).toContain('Open the link in that email to choose a new password.');
    expect(html).toContain('id="check-email-login-link"');
  });

  it('escapes the emailed address when it looks like HTML', () => {
    const html = renderCheckEmailScreen({
      authEmail: '<b>bad@x.com</b>',
      authLoading: false,
    });
    expect(html).toContain('&lt;b&gt;bad@x.com&lt;/b&gt;');
    expect(html).not.toContain('<b>bad@x.com</b>');
  });
});
