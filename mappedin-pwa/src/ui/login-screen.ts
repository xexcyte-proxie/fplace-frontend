import type { AppState } from '../types';
import { isGoogleSignInConfigured } from '../services/auth-service';
import { AUTH_AUTOCOMPLETE } from './auth-autofill';
import { authFieldError } from './auth-field-error';
import { renderBusyLabel } from './content-loading-overlay';
import { escapeHtml } from './escape-html';

const AUTH_ASSETS = {
  back: '/auth/back-chevron.svg',
  eye: '/auth/eye.svg',
  google: '/auth/google.svg',
} as const;

export function renderLoginScreen(
  state: Pick<AppState, 'authEmail' | 'authLoading' | 'authFieldErrors'>,
): string {
  const emailError = authFieldError(state.authFieldErrors, 'email');
  const passwordError = authFieldError(state.authFieldErrors, 'password');
  const generalError = authFieldError(state.authFieldErrors, '_form');
  const googleEnabled = isGoogleSignInConfigured();

  return `
    <div class="auth-screen login-screen">
      <button type="button" id="login-back-btn" class="auth-back-btn" aria-label="Back">
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
        <h1 class="auth-title auth-title--sans">Welcome back</h1>
        <p class="auth-subtitle">
          You will stay anonymous inside the venue.
        </p>
      </div>

      <form id="login-form" class="auth-form" method="post" autocomplete="on" novalidate>
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

        <label class="auth-field">
          <span class="auth-label">Password</span>
          <div class="auth-input-wrap">
            <input
              id="login-password"
              name="password"
              type="password"
              class="auth-input auth-input--with-toggle${passwordError ? ' auth-input--error' : ''}"
              placeholder="••••••••"
              autocomplete="${AUTH_AUTOCOMPLETE.currentPassword}"
              minlength="8"
              title="Password must be at least 8 characters."
              ${state.authLoading ? 'disabled' : ''}
              required
            />
            <button
              type="button"
              class="auth-password-toggle"
              data-password-toggle="login-password"
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
          <span
            id="login-password-progress"
            class="auth-password-progress"
            aria-live="polite"
            hidden
          >
            Password must be at least 8 characters.
          </span>
          ${passwordError ? `<span class="auth-field-error" role="alert">${escapeHtml(passwordError)}</span>` : ''}
        </label>

        <p class="auth-forgot-row">
          <button
            type="button"
            id="login-forgot-link"
            class="auth-inline-link auth-inline-link--accent"
            ${state.authLoading ? 'disabled' : ''}
          >
            Forgot password?
          </button>
        </p>

        <div class="auth-actions">
          <button
            type="submit"
            id="login-submit-btn"
            class="onboarding-primary-btn auth-submit-btn${state.authLoading ? ' is-loading' : ''}"
            ${state.authLoading ? 'disabled' : ''}
            aria-busy="${state.authLoading ? 'true' : 'false'}"
          >
            ${state.authLoading ? renderBusyLabel('Logging in…') : 'Log in'}
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
              <img src="${AUTH_ASSETS.google}" alt="" width="18" height="18" aria-hidden="true" />
              Continue with Google
            </button>
          `
              : ''
          }

          <p class="auth-footer-text">
            New here?
            <button
              type="button"
              id="login-create-link"
              class="auth-inline-link auth-inline-link--accent"
              ${state.authLoading ? 'disabled' : ''}
            >
              Create account
            </button>
          </p>
        </div>
      </form>
    </div>
  `;
}
