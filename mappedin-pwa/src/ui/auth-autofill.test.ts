import { describe, expect, it } from 'vitest';

import { renderChangePasswordScreen } from './change-password-screen';
import { renderCreateAccountScreen } from './create-account-screen';
import { renderForgotPasswordScreen } from './forgot-password-screen';
import { renderLoginScreen } from './login-screen';
import { renderPseudoNameScreen } from './pseudo-name-screen';
import { renderResetPasswordConfirmScreen } from './reset-password-confirm-screen';
import { renderVerifyEmailScreen } from './verify-email-screen';
import {
  AUTH_AUTOCOMPLETE,
  AUTH_AUTOFILL_ANIMATION_NAME,
  renderHiddenUsernameField,
} from './auth-autofill';

const emptyAuthState = {
  authEmail: 'fan@email.com',
  authLoading: false,
  authFieldErrors: {},
};

describe('auth autofill markup', () => {
  it('exposes the CSS animation name used to detect Chrome autofill', () => {
    expect(AUTH_AUTOFILL_ANIMATION_NAME).toBe('auth-autofill-start');
  });

  it('marks login email as username and password as current-password', () => {
    const html = renderLoginScreen(emptyAuthState);
    expect(html).toContain('id="login-form"');
    expect(html).toContain('method="post"');
    expect(html).toContain(`autocomplete="${AUTH_AUTOCOMPLETE.username}"`);
    expect(html).toContain(
      `autocomplete="${AUTH_AUTOCOMPLETE.currentPassword}"`,
    );
    expect(html).toContain('name="username"');
    expect(html).toContain('name="password"');
  });

  it('shows a circular spinner on Log in while auth is in flight', () => {
    const html = renderLoginScreen({ ...emptyAuthState, authLoading: true });
    expect(html).toContain('busy-indicator');
    expect(html).toContain('Logging in…');
    expect(html).toContain('is-loading');
  });

  it('marks create-account email as username and passwords as new-password', () => {
    const html = renderCreateAccountScreen({
      ...emptyAuthState,
      guestAccessAllowed: true,
      guestContinueLoading: false,
    });
    expect(html).toContain('id="create-account-form"');
    expect(html).toContain('method="post"');
    expect(html).toContain('autocomplete="on"');
    expect(html).toContain(`autocomplete="${AUTH_AUTOCOMPLETE.username}"`);
    expect(html.match(new RegExp(`autocomplete="${AUTH_AUTOCOMPLETE.newPassword}"`, 'g'))).toHaveLength(2);
  });

  it('marks forgot-password email as the account identifier', () => {
    const html = renderForgotPasswordScreen(emptyAuthState);
    expect(html).toContain('name="username"');
    expect(html).toContain(`autocomplete="${AUTH_AUTOCOMPLETE.username}"`);
  });

  it('keeps one-time-code on the first OTP box so iOS/Android can insert the code', () => {
    const html = renderVerifyEmailScreen(emptyAuthState);
    expect(html).toContain('id="verify-email-form"');
    expect(html).toContain('autocomplete="on"');
    expect(html).toContain(`name="${AUTH_AUTOCOMPLETE.oneTimeCode}"`);
    expect(html).toContain(
      `autocomplete="${AUTH_AUTOCOMPLETE.oneTimeCode}"`,
    );
    expect(html).toContain('maxlength="6"');
  });

  it('includes a hidden username on password-only reset and change forms', () => {
    const resetHtml = renderResetPasswordConfirmScreen({
      authLoading: false,
      authFieldErrors: {},
      username: 'fan@email.com',
    });
    expect(resetHtml).toContain('name="username"');
    expect(resetHtml).toContain('value="fan@email.com"');
    expect(resetHtml).toContain(
      `autocomplete="${AUTH_AUTOCOMPLETE.newPassword}"`,
    );

    const changeHtml = renderChangePasswordScreen({
      authLoading: false,
      authFieldErrors: {},
      username: 'fan@email.com',
    });
    expect(changeHtml).toContain('name="username"');
    expect(changeHtml).toContain('value="fan@email.com"');
    expect(changeHtml).toContain(
      `autocomplete="${AUTH_AUTOCOMPLETE.currentPassword}"`,
    );
    expect(changeHtml).toContain(
      `autocomplete="${AUTH_AUTOCOMPLETE.newPassword}"`,
    );
  });

  it('does not treat pseudo-name as a login username', () => {
    const html = renderPseudoNameScreen({
      pseudoNameDraft: '',
      pseudoNameHint: 'Fan_01',
      selectedInterests: [],
      interestOptions: ['Live music'],
      authLoading: false,
      authFieldErrors: {},
    });
    expect(html).toContain(`autocomplete="${AUTH_AUTOCOMPLETE.displayName}"`);
    expect(html).not.toContain(`autocomplete="${AUTH_AUTOCOMPLETE.username}"`);
  });

  it('escapes hidden username values', () => {
    const html = renderHiddenUsernameField('a"b&c');
    expect(html).toContain('value="a&quot;b&amp;c"');
    expect(html).toContain(`autocomplete="${AUTH_AUTOCOMPLETE.username}"`);
  });
});
