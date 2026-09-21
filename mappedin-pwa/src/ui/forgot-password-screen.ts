import type { AppState } from '../types';
import { AUTH_AUTOCOMPLETE } from './auth-autofill';
import { authFieldError } from './auth-field-error';
import { renderBusyLabel } from './content-loading-overlay';
import { escapeHtml } from './escape-html';

const AUTH_ASSETS = {
  back: '/auth/back-chevron.svg',
} as const;

export function renderForgotPasswordScreen(
  state: Pick<AppState, 'authEmail' | 'authLoading' | 'authFieldErrors'>,
): string {
  const emailError = authFieldError(state.authFieldErrors, 'email');
  const generalError = authFieldError(state.authFieldErrors, '_form');

  return `
    <div class="auth-screen forgot-password-screen">
      <button type="button" id="forgot-password-back-btn" class="auth-back-btn" aria-label="Back">
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
        <h1 class="auth-title auth-title--sans">Forgot password</h1>
        <p class="auth-subtitle">
          Enter your email and we will send a reset link.
        </p>
      </div>

      <form id="forgot-password-form" class="auth-form" method="post" autocomplete="on" novalidate>
        ${
          generalError
            ? `<p class="auth-form-error" role="alert">${escapeHtml(generalError)}</p>`
            : ''
        }

        <label class="auth-field">
          <span class="auth-label">Email</span>
          <input
            id="forgot-password-email"
            name="username"
            type="email"
            class="auth-input${emailError ? ' auth-input--error' : ''}"
            placeholder="fan@email.com"
            autocomplete="${AUTH_AUTOCOMPLETE.username}"
            inputmode="email"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            value="${escapeHtml(state.authEmail)}"
            ${state.authLoading ? 'disabled' : ''}
            required
          />
          ${emailError ? `<span class="auth-field-error" role="alert">${escapeHtml(emailError)}</span>` : ''}
        </label>

        <div class="auth-actions">
          <button
            type="submit"
            id="forgot-password-submit-btn"
            class="onboarding-primary-btn auth-submit-btn${state.authLoading ? ' is-loading' : ''}"
            ${state.authLoading ? 'disabled' : ''}
            aria-busy="${state.authLoading ? 'true' : 'false'}"
          >
            ${state.authLoading ? renderBusyLabel('Sending…') : 'Send reset link'}
          </button>

          <p class="auth-footer-text">
            <button
              type="button"
              id="forgot-password-login-link"
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
