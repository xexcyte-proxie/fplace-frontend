import type { AppState } from '../types';

const AUTH_ASSETS = {
  back: '/auth/back-chevron.svg',
  mail: '/auth/mail-icon.svg',
} as const;

export function renderCheckEmailScreen(
  state: Pick<AppState, 'authEmail' | 'authLoading'>,
): string {
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
          We sent a verification link and code to
        </p>
        <p class="check-email-address">${escapeHtml(state.authEmail)}</p>
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
