import type { AppState } from '../types';

function fieldError(errors: Record<string, string>, key: string): string {
  return errors[key] ?? '';
}

export function renderVerifyEmailScreen(
  state: Pick<AppState, 'authEmail' | 'authLoading' | 'authFieldErrors'>,
): string {
  const otpError = fieldError(state.authFieldErrors, 'otp');
  const generalError = fieldError(state.authFieldErrors, '_form');
  const digits = Array.from({ length: 6 }, (_, index) => index);

  return `
    <div class="auth-screen">
      <button type="button" id="verify-back-btn" class="auth-back-btn" aria-label="Back">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <div class="auth-header">
        <h1 class="auth-title">Verify your email</h1>
        <p class="auth-subtitle">
          Enter the 6-digit code we sent to
          <span class="auth-email-highlight">${escapeHtml(state.authEmail)}</span>
        </p>
      </div>

      <form id="verify-email-form" class="auth-form" novalidate>
        ${
          generalError
            ? `<p class="auth-form-error" role="alert">${escapeHtml(generalError)}</p>`
            : ''
        }

        <div class="otp-field">
          <div class="otp-inputs" role="group" aria-label="6-digit verification code">
            ${digits
              .map(
                (index) => `
              <input
                id="otp-digit-${index}"
                class="otp-digit${otpError ? ' otp-digit--error' : ''}"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="1"
                autocomplete="one-time-code"
                data-otp-index="${index}"
                aria-label="Digit ${index + 1} of 6"
                ${state.authLoading ? 'disabled' : ''}
              />
            `,
              )
              .join('')}
          </div>
          ${otpError ? `<span class="auth-field-error" role="alert">${escapeHtml(otpError)}</span>` : ''}
        </div>

        <div class="auth-actions">
          <button
            type="submit"
            id="verify-submit-btn"
            class="onboarding-primary-btn auth-submit-btn"
            ${state.authLoading ? 'disabled' : ''}
          >
            ${state.authLoading ? 'Verifying…' : 'Continue'}
          </button>
          <p class="auth-footer-text">
            Didn't get a code?
            <button type="button" id="verify-resend-btn" class="auth-inline-link" ${state.authLoading ? 'disabled' : ''}>
              Resend
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
