import type { AppState } from '../types';
import { AUTH_AUTOCOMPLETE, renderHiddenUsernameField } from './auth-autofill';
import { authFieldError } from './auth-field-error';
import { renderBusyLabel } from './content-loading-overlay';
import { escapeHtml } from './escape-html';

const AUTH_ASSETS = {
  eye: '/auth/eye.svg',
  eyeOff: '/auth/eye-off.svg',
} as const;

export interface ChangePasswordScreenView {
  authLoading: boolean;
  authFieldErrors: Record<string, string>;
  /** When true, current-password field is shown as plain text. */
  oldPasswordVisible?: boolean;
  /** When true, new-password field is shown as plain text. */
  newPasswordVisible?: boolean;
  /** Account email so the password manager can update the right login. */
  username?: string;
}

export function renderChangePasswordScreen(
  state: ChangePasswordScreenView | Pick<AppState, 'authLoading' | 'authFieldErrors'>,
): string {
  const oldError = authFieldError(state.authFieldErrors, 'old_password');
  const newError = authFieldError(state.authFieldErrors, 'new_password');
  const generalError = authFieldError(state.authFieldErrors, '_form');
  const oldVisible =
    'oldPasswordVisible' in state ? Boolean(state.oldPasswordVisible) : false;
  const newVisible =
    'newPasswordVisible' in state ? Boolean(state.newPasswordVisible) : false;
  const username =
    'username' in state && typeof state.username === 'string'
      ? state.username
      : '';

  return `
    <div class="settings-screen">
      <header class="settings-header">
        <button type="button" id="change-password-back-btn" class="settings-back-btn" aria-label="Back" ${state.authLoading ? 'disabled' : ''}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
        <h1 class="settings-title">Change password</h1>
      </header>

      <div class="settings-content">
        <form id="change-password-form" class="settings-edit-form" method="post" autocomplete="on" novalidate>
          ${
            generalError
              ? `<p class="settings-form-error" role="alert">${escapeHtml(generalError)}</p>`
              : ''
          }
          ${renderHiddenUsernameField(username)}

          <section class="settings-group">
            <h2 class="settings-group-label">Current password</h2>
            <div class="settings-card settings-card--padded">
              <div class="auth-field">
                <label class="auth-label visually-hidden" for="change-password-old">Current password</label>
                <div class="auth-input-wrap">
                  <input
                    id="change-password-old"
                    name="old_password"
                    type="${oldVisible ? 'text' : 'password'}"
                    class="auth-input auth-input--with-toggle${oldError ? ' auth-input--error' : ''}"
                    placeholder="••••••••"
                    autocomplete="${AUTH_AUTOCOMPLETE.currentPassword}"
                    ${state.authLoading ? 'disabled' : ''}
                    required
                  />
                  <button
                    type="button"
                    class="auth-password-toggle"
                    data-password-toggle="change-password-old"
                    aria-label="${oldVisible ? 'Hide password' : 'Show password'}"
                    aria-pressed="${oldVisible ? 'true' : 'false'}"
                    ${state.authLoading ? 'disabled' : ''}
                  >
                    <img
                      class="auth-password-toggle-icon"
                      src="${oldVisible ? AUTH_ASSETS.eyeOff : AUTH_ASSETS.eye}"
                      alt=""
                      width="24"
                      height="24"
                      decoding="async"
                    />
                  </button>
                </div>
                ${oldError ? `<span class="auth-field-error" role="alert">${escapeHtml(oldError)}</span>` : ''}
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h2 class="settings-group-label">New password</h2>
            <div class="settings-card settings-card--padded">
              <div class="auth-field">
                <label class="auth-label visually-hidden" for="change-password-new">New password</label>
                <div class="auth-input-wrap">
                  <input
                    id="change-password-new"
                    name="new_password"
                    type="${newVisible ? 'text' : 'password'}"
                    class="auth-input auth-input--with-toggle${newError ? ' auth-input--error' : ''}"
                    placeholder="••••••••"
                    autocomplete="${AUTH_AUTOCOMPLETE.newPassword}"
                    ${state.authLoading ? 'disabled' : ''}
                    required
                  />
                  <button
                    type="button"
                    class="auth-password-toggle"
                    data-password-toggle="change-password-new"
                    aria-label="${newVisible ? 'Hide password' : 'Show password'}"
                    aria-pressed="${newVisible ? 'true' : 'false'}"
                    ${state.authLoading ? 'disabled' : ''}
                  >
                    <img
                      class="auth-password-toggle-icon"
                      src="${newVisible ? AUTH_ASSETS.eyeOff : AUTH_ASSETS.eye}"
                      alt=""
                      width="24"
                      height="24"
                      decoding="async"
                    />
                  </button>
                </div>
                ${
                  newError
                    ? `<span class="auth-field-error" role="alert">${escapeHtml(newError)}</span>`
                    : `<p class="settings-field-hint">At least 8 characters with a letter and a number.</p>`
                }
              </div>
            </div>
          </section>

          <div class="settings-edit-actions">
            <button
              type="submit"
              id="change-password-submit-btn"
              class="onboarding-primary-btn auth-submit-btn${state.authLoading ? ' is-loading' : ''}"
              ${state.authLoading ? 'disabled' : ''}
              aria-busy="${state.authLoading ? 'true' : 'false'}"
            >
              ${state.authLoading ? renderBusyLabel('Updating…') : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}
