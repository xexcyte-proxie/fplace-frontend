import type { AppState } from '../types';
import { isGoogleSignInConfigured } from '../services/auth-service';

const AUTH_ASSETS = {
  back: '/auth/back-chevron.svg',
  eye: '/auth/eye.svg',
  checkGreen: '/auth/check-green.svg',
  checkWhite: '/auth/check-white.svg',
  google: '/auth/google.svg',
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

export function renderCreateAccountScreen(
  state: Pick<
    AppState,
    'authEmail' | 'authLoading' | 'authFieldErrors' | 'guestAccessAllowed'
  >,
): string {
  const emailError = fieldError(state.authFieldErrors, 'email');
  const passwordError = fieldError(state.authFieldErrors, 'password');
  const passwordConfirmError = fieldError(
    state.authFieldErrors,
    'password_confirm',
  );
  const termsError = fieldError(state.authFieldErrors, 'terms');
  const generalError = fieldError(state.authFieldErrors, '_form');
  const googleEnabled = isGoogleSignInConfigured();
  const guestEnabled = state.guestAccessAllowed !== false;

  return `
    <div class="auth-screen auth-screen--create">
      <button type="button" id="auth-back-btn" class="auth-back-btn" aria-label="Back">
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
        <h1 class="auth-title">Create your account</h1>
        <p class="auth-subtitle">
          You will stay anonymous inside the venue.
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
            placeholder="fan@email.com"
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
          <div class="auth-input-wrap">
            <input
              id="auth-password"
              name="password"
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
              data-password-toggle="auth-password"
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
          ${passwordError ? `<span class="auth-field-error" role="alert">${escapeHtml(passwordError)}</span>` : ''}
        </label>

        <label class="auth-field">
          <span class="auth-label">Confirm password</span>
          <div class="auth-input-wrap">
            <input
              id="auth-password-confirm"
              name="password_confirm"
              type="password"
              class="auth-input auth-input--with-toggle${passwordConfirmError ? ' auth-input--error' : ''}"
              placeholder="••••••••"
              autocomplete="new-password"
              ${state.authLoading ? 'disabled' : ''}
              required
            />
            <button
              type="button"
              class="auth-password-toggle"
              data-password-toggle="auth-password-confirm"
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
            id="auth-password-strength"
            class="auth-password-strength"
            hidden
          >
            <img
              class="auth-password-strength-icon"
              src="${AUTH_ASSETS.checkGreen}"
              alt=""
              width="14"
              height="14"
              decoding="async"
            />
            Strong password
          </span>
          ${passwordConfirmError ? `<span class="auth-field-error" role="alert">${escapeHtml(passwordConfirmError)}</span>` : ''}
        </label>

        <label class="auth-terms">
          <span class="auth-terms-box">
            <input
              id="auth-terms"
              name="terms"
              type="checkbox"
              class="auth-terms-input"
              ${state.authLoading ? 'disabled' : ''}
            />
            <span class="auth-terms-check" aria-hidden="true">
              <img
                src="${AUTH_ASSETS.checkWhite}"
                alt=""
                width="14"
                height="14"
                decoding="async"
              />
            </span>
          </span>
          <span class="auth-terms-copy">
            I agree to the
            <button type="button" id="auth-terms-link" class="auth-legal-link">Terms of Service</button>
            and
            <button type="button" id="auth-privacy-link" class="auth-legal-link">Privacy Policy</button>.
          </span>
        </label>
        ${termsError ? `<span class="auth-field-error auth-terms-error" role="alert">${escapeHtml(termsError)}</span>` : ''}

        <div class="auth-actions">
          <button
            type="submit"
            id="auth-continue-btn"
            class="auth-cta-primary auth-submit-btn"
            ${state.authLoading ? 'disabled' : ''}
          >
            ${state.authLoading ? 'Creating account…' : 'Continue'}
          </button>

          ${
            googleEnabled
              ? `
            <div class="auth-divider" role="separator" aria-label="or">
              <span>or</span>
            </div>
            <button
              type="button"
              id="auth-google-btn"
              class="auth-google-btn"
              ${state.authLoading ? 'disabled' : ''}
            >
              <img src="${AUTH_ASSETS.google}" alt="" width="18" height="18" aria-hidden="true" />
              Continue with Google
            </button>
          `
              : ''
          }

          ${
            guestEnabled
              ? `
            <button
              type="button"
              id="auth-guest-btn"
              class="auth-guest-btn"
              ${state.authLoading ? 'disabled' : ''}
            >
              Continue as guest
            </button>
          `
              : ''
          }

          <p class="auth-footer-text">
            Already have an account?
            <button type="button" id="auth-login-link" class="auth-inline-link">
              Login
            </button>
          </p>
        </div>
      </form>
    </div>
  `;
}
