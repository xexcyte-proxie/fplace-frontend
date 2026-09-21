import { describe, expect, it } from 'vitest';

import { renderChangePasswordScreen } from './change-password-screen';

const emptyState = {
  authLoading: false,
  authFieldErrors: {},
};

describe('renderChangePasswordScreen', () => {
  it('keeps change-password form hooks used by ui-root-events', () => {
    const html = renderChangePasswordScreen(emptyState);
    expect(html).toContain('id="change-password-back-btn"');
    expect(html).toContain('id="change-password-form"');
    expect(html).toContain('id="change-password-old"');
    expect(html).toContain('id="change-password-new"');
    expect(html).toContain('data-password-toggle="change-password-old"');
    expect(html).toContain('data-password-toggle="change-password-new"');
    expect(html).toContain('id="change-password-submit-btn"');
    expect(html).toContain('Update password');
    expect(html).toContain('At least 8 characters with a letter and a number.');
  });

  it('escapes field errors that look like HTML', () => {
    const html = renderChangePasswordScreen({
      authLoading: false,
      authFieldErrors: {
        old_password: '<b>old</b>',
        new_password: '<i>new</i>',
        _form: '<img src=x>',
      },
    });
    expect(html).toContain('&lt;b&gt;old&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;new&lt;/i&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<b>old</b>');
    expect(html).not.toContain('<i>new</i>');
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('At least 8 characters with a letter and a number.');
  });
});
