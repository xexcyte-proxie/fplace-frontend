import { describe, expect, it } from 'vitest';

import { renderVerifyEmailScreen } from './verify-email-screen';

const emptyState = {
  authEmail: '',
  authLoading: false,
  authFieldErrors: {},
};

describe('renderVerifyEmailScreen', () => {
  it('keeps verify-email form hooks used by ui-root-events', () => {
    const html = renderVerifyEmailScreen(emptyState);
    expect(html).toContain('id="verify-back-btn"');
    expect(html).toContain('id="verify-email-form"');
    expect(html).toContain('id="otp-digit-0"');
    expect(html).toContain('id="otp-digit-5"');
    expect(html).toContain('data-otp-index="0"');
    expect(html).toContain('id="verify-resend-status"');
    expect(html).toContain('id="verify-resend-timer"');
    expect(html).toContain('id="verify-resend-btn"');
    expect(html).toContain('id="verify-submit-btn"');
    expect(html).toContain('Enter the code');
  });

  it('escapes OTP and form errors that look like HTML', () => {
    const html = renderVerifyEmailScreen({
      authEmail: '',
      authLoading: false,
      authFieldErrors: {
        otp: '<b>bad</b>',
        _form: '<i>nope</i>',
      },
    });
    expect(html).toContain('&lt;b&gt;bad&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;nope&lt;/i&gt;');
    expect(html).not.toContain('<b>bad</b>');
    expect(html).not.toContain('<i>nope</i>');
  });
});
