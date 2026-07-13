import type { AppState } from '../types';

function fieldError(errors: Record<string, string>, key: string): string {
  return errors[key] ?? '';
}

export function renderCreateAccountScreen(
  state: Pick<AppState, 'authEmail' | 'authLoading' | 'authFieldErrors'>,
): string {
  const emailError = fieldError(state.authFieldErrors, 'email');
  const passwordError = fieldError(state.authFieldErrors, 'password');
  const passwordConfirmError = fieldError(
    state.authFieldErrors,
    'password_confirm',
  );
  const generalError = fieldError(state.authFieldErrors, '_form');

  return `
    <div class="auth-screen">
      <button type="button" id="auth-back-btn" class="auth-back-btn" aria-label="Back">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <div class="auth-header">
        <h1 class="auth-title">Create your account</h1>
        <p class="auth-subtitle">
          Just the basics for now. You can fill out the rest later.
        </p>
      </div>

      <form id="create-account-form" class="auth-form" novalidate>
        ${
          generalError
            ? `<p class="auth-form-error" role="alert">${escapeHtml(generalError)}</p>`
            : ''
        }

        <label class="auth-field">
          <span class="auth-label">Email</span>
          <input
            id="auth-email"
            name="email"
            type="email"
            class="auth-input${emailError ? ' auth-input--error' : ''}"
            placeholder="you@email.com"
            autocomplete="email"
            inputmode="email"
            value="${escapeHtml(state.authEmail)}"
            ${state.authLoading ? 'disabled' : ''}
            required
          />
          ${emailError ? `<span class="auth-field-error" role="alert">${escapeHtml(emailError)}</span>` : ''}
        </label>

        <label class="auth-field">
          <span class="auth-label">Password</span>
          <input
            id="auth-password"
            name="password"
            type="password"
            class="auth-input${passwordError ? ' auth-input--error' : ''}"
            placeholder="••••••••"
            autocomplete="new-password"
            ${state.authLoading ? 'disabled' : ''}
            required
          />
          ${passwordError ? `<span class="auth-field-error" role="alert">${escapeHtml(passwordError)}</span>` : ''}
        </label>

        <label class="auth-field">
          <span class="auth-label">Confirm password</span>
          <input
            id="auth-password-confirm"
            name="password_confirm"
            type="password"
            class="auth-input${passwordConfirmError ? ' auth-input--error' : ''}"
            placeholder="••••••••"
            autocomplete="new-password"
            ${state.authLoading ? 'disabled' : ''}
            required
          />
          ${passwordConfirmError ? `<span class="auth-field-error" role="alert">${escapeHtml(passwordConfirmError)}</span>` : ''}
        </label>

        <div class="auth-actions">
          <button
            type="submit"
            id="auth-continue-btn"
            class="onboarding-primary-btn auth-submit-btn"
            ${state.authLoading ? 'disabled' : ''}
          >
            ${state.authLoading ? 'Creating account…' : 'Continue'}
          </button>
          <p class="auth-footer-text">
            Already have an account?
            <button type="button" id="auth-login-link" class="auth-inline-link">
              Log in
            </button>
          </p>
        </div>
      </form>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
