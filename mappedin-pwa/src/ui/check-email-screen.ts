import type { AppState } from '../types';
import mailIcon from '../../assets/mail.png';

export function renderCheckEmailScreen(
  state: Pick<AppState, 'authEmail' | 'authLoading'>,
): string {
  return `
    <div class="auth-screen check-email-screen">
      <button type="button" id="check-email-back-btn" class="auth-back-btn" aria-label="Back">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <div class="check-email-body">
        <div class="check-email-icon-wrap" aria-hidden="true">
          <div class="check-email-icon-card">
            <img
              class="check-email-icon"
              src="${mailIcon}"
              alt=""
              width="56"
              height="56"
              decoding="async"
            />
          </div>
        </div>

        <h1 class="check-email-title">Check your email</h1>
        <p class="check-email-subtitle">
          We sent a verification link and code to
          <span class="auth-email-highlight">${escapeHtml(state.authEmail)}</span>
        </p>
      </div>

      <div class="auth-actions">
        <button
          type="button"
          id="check-email-continue-btn"
          class="onboarding-primary-btn auth-submit-btn"
          ${state.authLoading ? 'disabled' : ''}
        >
          Continue
        </button>
        <p class="auth-footer-text">
          Did not get it?
          <button
            type="button"
            id="check-email-resend-btn"
            class="auth-inline-link auth-inline-link--accent"
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
