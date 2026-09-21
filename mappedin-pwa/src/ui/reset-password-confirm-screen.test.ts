import { describe, expect, it } from 'vitest';

import { renderResetPasswordConfirmScreen } from './reset-password-confirm-screen';

const emptyState = {
  authLoading: false,
  authFieldErrors: {},
};

describe('renderResetPasswordConfirmScreen', () => {
  it('keeps reset-password form hooks used by ui-root-events', () => {
    const html = renderResetPasswordConfirmScreen(emptyState);
    expect(html).toContain('id="reset-password-back-btn"');
    expect(html).toContain('id="reset-password-confirm-form"');
    expect(html).toContain('id="reset-password-new"');
    expect(html).toContain('data-password-toggle="reset-password-new"');
    expect(html).toContain('id="reset-password-submit-btn"');
    expect(html).toContain('id="reset-password-login-link"');
    expect(html).toContain('Set new password');
    expect(html).toContain('At least 8 characters with a letter and a number.');
  });

  it('escapes field errors that look like HTML', () => {
    const html = renderResetPasswordConfirmScreen({
      authLoading: false,
      authFieldErrors: {
        new_password: '<b>weak</b>',
        _form: '<i>nope</i>',
      },
    });
    expect(html).toContain('&lt;b&gt;weak&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;nope&lt;/i&gt;');
    expect(html).not.toContain('<b>weak</b>');
    expect(html).not.toContain('<i>nope</i>');
    expect(html).not.toContain('At least 8 characters with a letter and a number.');
  });
});
