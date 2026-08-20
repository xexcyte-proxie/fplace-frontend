import type { AppState, AuthCheckEmailPurpose } from '../types';

const AUTH_ASSETS = {
  back: '/auth/back-chevron.svg',
  mail: '/auth/mail-icon.svg',
} as const;

export function renderCheckEmailScreen(
  state: Pick<AppState, 'authEmail' | 'authLoading'> & {
    checkEmailPurpose?: AuthCheckEmailPurpose | null;
  },
): string {
  const purpose = state.checkEmailPurpose ?? 'verify';
  const isPasswordReset = purpose === 'password-reset';

  return `
    <div class="auth-screen check-email-screen">
      <button type="button" id="check-email-back-btn" class="auth-back-btn" aria-label="Back">
        <img
          class="auth-back-icon"
          src="${AUTH_ASSETS.back}"
          alt=""
          width="22"
          height="22"
          decoding="async"
        />
      </button>

      <div class="check-email-body">
        <div class="check-email-icon-wrap" aria-hidden="true">
          <div class="check-email-icon-card">
            <img
              class="check-email-icon"
              src="${AUTH_ASSETS.mail}"
              alt=""
              width="60"
              height="60"
              decoding="async"
            />
          </div>
        </div>

        <h1 class="check-email-title">Check your email</h1>
        <p class="check-email-subtitle">
          ${
            isPasswordReset
              ? 'We sent a password reset link to'
              : 'We sent a verification link and code to'
          }
        </p>
        <p class="check-email-address">${escapeHtml(state.authEmail)}</p>
        ${
          isPasswordReset
            ? `<p class="check-email-hint">Open the link in that email to choose a new password.</p>`
            : ''
        }
      </div>

      <div class="auth-actions check-email-actions">
        <p class="check-email-resend">
          Did not get it?
          <button
            type="button"
            id="check-email-resend-btn"
            class="auth-legal-link"
            ${state.authLoading ? 'disabled' : ''}
          >
            Resend
          </button>
        </p>
        ${
          isPasswordReset
            ? `
          <p class="auth-footer-text">
            <button
              type="button"
              id="check-email-login-link"
              class="auth-inline-link auth-inline-link--accent"
              ${state.authLoading ? 'disabled' : ''}
            >
              Back to log in
            </button>
          </p>
        `
            : ''
        }
      </div>
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
