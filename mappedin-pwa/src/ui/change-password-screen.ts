import type { AppState } from '../types';

const AUTH_ASSETS = {
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

export function renderChangePasswordScreen(
  state: Pick<AppState, 'authLoading' | 'authFieldErrors'>,
): string {
  const oldError = fieldError(state.authFieldErrors, 'old_password');
  const newError = fieldError(state.authFieldErrors, 'new_password');
  const generalError = fieldError(state.authFieldErrors, '_form');

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
        <form id="change-password-form" class="settings-edit-form" autocomplete="on" novalidate>
          ${
            generalError
              ? `<p class="settings-form-error" role="alert">${escapeHtml(generalError)}</p>`
              : ''
          }

          <section class="settings-group">
            <h2 class="settings-group-label">Current password</h2>
            <div class="settings-card settings-card--padded">
              <label class="auth-field">
                <span class="auth-label visually-hidden">Current password</span>
                <div class="auth-input-wrap">
                  <input
                    id="change-password-old"
                    name="old_password"
                    type="password"
                    class="auth-input auth-input--with-toggle${oldError ? ' auth-input--error' : ''}"
                    placeholder="••••••••"
                    autocomplete="current-password"
                    ${state.authLoading ? 'disabled' : ''}
                    required
                  />
                  <button
                    type="button"
                    class="auth-password-toggle"
                    data-password-toggle="change-password-old"
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
                ${oldError ? `<span class="auth-field-error" role="alert">${escapeHtml(oldError)}</span>` : ''}
              </label>
            </div>
          </section>

          <section class="settings-group">
            <h2 class="settings-group-label">New password</h2>
            <div class="settings-card settings-card--padded">
              <label class="auth-field">
                <span class="auth-label visually-hidden">New password</span>
                <div class="auth-input-wrap">
                  <input
                    id="change-password-new"
                    name="new_password"
                    type="password"
                    class="auth-input auth-input--with-toggle${newError ? ' auth-input--error' : ''}"
                    placeholder="••••••••"
                    autocomplete="new-password"
                    ${state.authLoading ? 'disabled' : ''}
                    required
                  />
                  <button
                    type="button"
                    class="auth-password-toggle"
                    data-password-toggle="change-password-new"
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
                  newError
                    ? `<span class="auth-field-error" role="alert">${escapeHtml(newError)}</span>`
                    : `<p class="settings-field-hint">At least 8 characters with a letter and a number.</p>`
                }
              </label>
            </div>
          </section>

          <div class="settings-edit-actions">
            <button
              type="submit"
              id="change-password-submit-btn"
              class="onboarding-primary-btn auth-submit-btn"
              ${state.authLoading ? 'disabled' : ''}
            >
              ${state.authLoading ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}
