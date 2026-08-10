import type { AppState } from '../types';

const AUTH_ASSETS = {
  back: '/auth/back-chevron.svg',
} as const;

function fieldError(errors: Record<string, string>, key: string): string {
  return errors[key] ?? '';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderForgotPasswordScreen(
  state: Pick<AppState, 'authEmail' | 'authLoading' | 'authFieldErrors'>,
): string {
  const emailError = fieldError(state.authFieldErrors, 'email');
  const generalError = fieldError(state.authFieldErrors, '_form');

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

      <form id="forgot-password-form" class="auth-form" autocomplete="on" novalidate>
        ${
          generalError
            ? `<p class="auth-form-error" role="alert">${escapeHtml(generalError)}</p>`
            : ''
        }

        <label class="auth-field">
          <span class="auth-label">Email</span>
          <input
            id="forgot-password-email"
            name="email"
            type="email"
            class="auth-input${emailError ? ' auth-input--error' : ''}"
            placeholder="fan@email.com"
            autocomplete="email"
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
            class="onboarding-primary-btn auth-submit-btn"
            ${state.authLoading ? 'disabled' : ''}
          >
            ${state.authLoading ? 'Sending…' : 'Send reset link'}
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
