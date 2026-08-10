import type { AppState } from '../types';

const AUTH_ASSETS = {
  back: '/auth/back-chevron.svg',
  eye: '/auth/eye-icon.svg',
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

export function renderResetPasswordConfirmScreen(
  state: Pick<AppState, 'authLoading' | 'authFieldErrors'>,
): string {
  const passwordError = fieldError(state.authFieldErrors, 'new_password');
  const generalError = fieldError(state.authFieldErrors, '_form');

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

      <form id="reset-password-confirm-form" class="auth-form" autocomplete="on" novalidate>
        ${
          generalError
            ? `<p class="auth-form-error" role="alert">${escapeHtml(generalError)}</p>`
            : ''
        }

        <label class="auth-field">
          <span class="auth-label">New password</span>
          <div class="auth-input-wrap">
            <input
              id="reset-password-new"
              name="new_password"
              type="password"
              class="auth-input auth-input--with-toggle${passwordError ? ' auth-input--error' : ''}"
              placeholder="••••••••"
              autocomplete="new-password"
              ${state.authLoading ? 'disabled' : ''}
              required
            />
            <button
              type="button"
              class="auth-password-toggle"
              data-password-toggle="reset-password-new"
              aria-label="Show password"
              ${state.authLoading ? 'disabled' : ''}
            >
              <img
                class="auth-password-toggle-icon"
                src="${AUTH_ASSETS.eye}"
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
        </label>

        <div class="auth-actions">
          <button
            type="submit"
            id="reset-password-submit-btn"
            class="onboarding-primary-btn auth-submit-btn"
            ${state.authLoading ? 'disabled' : ''}
          >
            ${state.authLoading ? 'Saving…' : 'Update password'}
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
