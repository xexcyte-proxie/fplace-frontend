import { describe, expect, it } from 'vitest';

import { renderLoginScreen } from './login-screen';

const emptyState = {
  authEmail: '',
  authLoading: false,
  authFieldErrors: {},
};

describe('renderLoginScreen', () => {
  it('keeps login form hooks used by ui-root-events', () => {
    const html = renderLoginScreen(emptyState);
    expect(html).toContain('id="login-back-btn"');
    expect(html).toContain('id="login-form"');
    expect(html).toContain('id="login-email"');
    expect(html).toContain('id="login-password"');
    expect(html).toContain('data-password-toggle="login-password"');
    expect(html).toContain('id="login-forgot-link"');
    expect(html).toContain('id="login-submit-btn"');
    expect(html).toContain('id="login-create-link"');
  });

  it('escapes email and field errors that look like HTML', () => {
    const html = renderLoginScreen({
      authEmail: '"quoted"',
      authLoading: false,
      authFieldErrors: {
        email: '<b>bad</b>',
        _form: '<i>nope</i>',
      },
    });
    expect(html).toContain('value="&quot;quoted&quot;"');
    expect(html).toContain('&lt;b&gt;bad&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;nope&lt;/i&gt;');
    expect(html).not.toContain('<b>bad</b>');
    expect(html).not.toContain('<i>nope</i>');
  });
});
