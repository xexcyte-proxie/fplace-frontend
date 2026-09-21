import { describe, expect, it } from 'vitest';

import { renderForgotPasswordScreen } from './forgot-password-screen';

const emptyState = {
  authEmail: '',
  authLoading: false,
  authFieldErrors: {},
};

describe('renderForgotPasswordScreen', () => {
  it('keeps forgot-password form hooks used by ui-root-events', () => {
    const html = renderForgotPasswordScreen(emptyState);
    expect(html).toContain('id="forgot-password-back-btn"');
    expect(html).toContain('id="forgot-password-form"');
    expect(html).toContain('id="forgot-password-email"');
    expect(html).toContain('id="forgot-password-submit-btn"');
    expect(html).toContain('id="forgot-password-login-link"');
    expect(html).toContain('Send reset link');
  });

  it('escapes email and field errors that look like HTML', () => {
    const html = renderForgotPasswordScreen({
      authEmail: '"quoted"',
      authLoading: false,
      authFieldErrors: { email: '<b>bad</b>' },
    });
    expect(html).toContain('value="&quot;quoted&quot;"');
    expect(html).toContain('&lt;b&gt;bad&lt;/b&gt;');
    expect(html).not.toContain('<b>bad</b>');
  });
});
