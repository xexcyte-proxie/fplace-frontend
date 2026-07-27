import type { AppState } from '../types';
import { isGoogleSignInConfigured } from '../services/auth-service';

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

export function renderLoginScreen(
  state: Pick<AppState, 'authEmail' | 'authLoading' | 'authFieldErrors'>,
): string {
  const emailError = fieldError(state.authFieldErrors, 'email');
  const passwordError = fieldError(state.authFieldErrors, 'password');
  const generalError = fieldError(state.authFieldErrors, '_form');
  const googleEnabled = isGoogleSignInConfigured();

  return `
    <div class="auth-screen">
      <button type="button" id="login-back-btn" class="auth-back-btn" aria-label="Back">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <div class="auth-header">
        <h1 class="auth-title">Welcome back</h1>
        <p class="auth-subtitle">
          Log in to pick up where you left off inside the venue.
        </p>
      </div>

      <form id="login-form" class="auth-form" autocomplete="on" novalidate>
        ${
          generalError
            ? `<p class="auth-form-error" role="alert">${escapeHtml(generalError)}</p>`
            : ''
        }

        <label class="auth-field">
          <span class="auth-label">Email</span>
          <input
            id="login-email"
            name="username"
            type="email"
            class="auth-input${emailError ? ' auth-input--error' : ''}"
            placeholder="you@email.com"
            autocomplete="username"
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

        <label class="auth-field">
          <span class="auth-label">Password</span>
          <input
            id="login-password"
            name="password"
            type="password"
            class="auth-input${passwordError ? ' auth-input--error' : ''}"
            placeholder="••••••••"
            autocomplete="current-password"
            ${state.authLoading ? 'disabled' : ''}
            required
          />
          ${passwordError ? `<span class="auth-field-error" role="alert">${escapeHtml(passwordError)}</span>` : ''}
        </label>

        <div class="auth-actions">
          <button
            type="submit"
            id="login-submit-btn"
            class="onboarding-primary-btn auth-submit-btn"
            ${state.authLoading ? 'disabled' : ''}
          >
            ${state.authLoading ? 'Logging in…' : 'Log in'}
          </button>

          ${
            googleEnabled
              ? `
            <div class="auth-divider" role="separator" aria-label="or">
              <span>or</span>
            </div>
            <button
              type="button"
              id="login-google-btn"
              class="auth-google-btn"
              ${state.authLoading ? 'disabled' : ''}
            >
              <img src="/auth/google.svg" alt="" width="18" height="18" aria-hidden="true" />
              Continue with Google
            </button>
          `
              : ''
          }

          <p class="auth-footer-text">
            New here?
            <button type="button" id="login-create-link" class="auth-inline-link">
              Create an account
            </button>
          </p>
        </div>
      </form>
    </div>
  `;
}
