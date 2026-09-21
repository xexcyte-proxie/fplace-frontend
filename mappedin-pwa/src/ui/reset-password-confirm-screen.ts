import type { AppState } from '../types';
import { AUTH_AUTOCOMPLETE, renderHiddenUsernameField } from './auth-autofill';
import { authFieldError } from './auth-field-error';
import { renderBusyLabel } from './content-loading-overlay';
import { escapeHtml } from './escape-html';

const AUTH_ASSETS = {
  back: '/auth/back-chevron.svg',
  eye: '/auth/eye.svg',
  eyeOff: '/auth/eye-off.svg',
} as const;

export interface ResetPasswordConfirmScreenView {
  authLoading: boolean;
  authFieldErrors: Record<string, string>;
  passwordVisible?: boolean;
  /** Account email so the password manager can update the right login. */
  username?: string;
}

export function renderResetPasswordConfirmScreen(
  state:
    | ResetPasswordConfirmScreenView
    | Pick<AppState, 'authLoading' | 'authFieldErrors'>,
): string {
  const passwordError = authFieldError(state.authFieldErrors, 'new_password');
  const generalError = authFieldError(state.authFieldErrors, '_form');
  const passwordVisible =
    'passwordVisible' in state ? Boolean(state.passwordVisible) : false;
  const username =
    'username' in state && typeof state.username === 'string'
      ? state.username
      : '';

  return `
    <div class="auth-screen reset-password-confirm-screen">
      <button type="button" id="reset-password-back-btn" class="auth-back-btn" aria-label="Back">
        <img
          class="auth-back-icon"
          src="${AUTH_ASSETS.back}"
          alt=""
          width="22"
          height="22"
          decoding="async"
        />
      </button>

      <div class="auth-header">
        <h1 class="auth-title auth-title--sans">Set new password</h1>
        <p class="auth-subtitle">
          Choose a new password for your account.
        </p>
      </div>

      <form id="reset-password-confirm-form" class="auth-form" method="post" autocomplete="on" novalidate>
        ${
          generalError
            ? `<p class="auth-form-error" role="alert">${escapeHtml(generalError)}</p>`
            : ''
        }
        ${renderHiddenUsernameField(username)}

        <div class="auth-field">
          <label class="auth-label" for="reset-password-new">New password</label>
          <div class="auth-input-wrap">
            <input
              id="reset-password-new"
              name="new_password"
              type="${passwordVisible ? 'text' : 'password'}"
              class="auth-input auth-input--with-toggle${passwordError ? ' auth-input--error' : ''}"
              placeholder="••••••••"
              autocomplete="${AUTH_AUTOCOMPLETE.newPassword}"
              ${state.authLoading ? 'disabled' : ''}
              required
            />
            <button
              type="button"
              class="auth-password-toggle"
              data-password-toggle="reset-password-new"
              aria-label="${passwordVisible ? 'Hide password' : 'Show password'}"
              aria-pressed="${passwordVisible ? 'true' : 'false'}"
              ${state.authLoading ? 'disabled' : ''}
            >
              <img
                class="auth-password-toggle-icon"
                src="${passwordVisible ? AUTH_ASSETS.eyeOff : AUTH_ASSETS.eye}"
                alt=""
                width="24"
                height="24"
                decoding="async"
              />
            </button>
          </div>
          ${
            passwordError
              ? `<span class="auth-field-error" role="alert">${escapeHtml(passwordError)}</span>`
              : `<span class="auth-field-hint">At least 8 characters with a letter and a number.</span>`
          }
        </div>

        <div class="auth-actions">
          <button
            type="submit"
            id="reset-password-submit-btn"
            class="onboarding-primary-btn auth-submit-btn${state.authLoading ? ' is-loading' : ''}"
            ${state.authLoading ? 'disabled' : ''}
            aria-busy="${state.authLoading ? 'true' : 'false'}"
          >
            ${state.authLoading ? renderBusyLabel('Saving…') : 'Update password'}
          </button>

          <p class="auth-footer-text">
            <button
              type="button"
              id="reset-password-login-link"
              class="auth-inline-link auth-inline-link--accent"
              ${state.authLoading ? 'disabled' : ''}
            >
              Back to log in
            </button>
          </p>
        </div>
      </form>
    </div>
  `;
}
