import type { AppState } from '../types';
import {
  formatResendCountdown,
  RESEND_OTP_COOLDOWN_SECONDS,
} from '../auth/domain/resend-countdown';

const AUTH_ASSETS = {
  back: '/auth/back-chevron.svg',
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

export function renderVerifyEmailScreen(
  state: Pick<AppState, 'authEmail' | 'authLoading' | 'authFieldErrors'>,
): string {
  const otpError = fieldError(state.authFieldErrors, 'otp');
  const generalError = fieldError(state.authFieldErrors, '_form');
  const digits = Array.from({ length: 6 }, (_, index) => index);

  return `
    <div class="auth-screen verify-email-screen">
      <button type="button" id="verify-back-btn" class="auth-back-btn" aria-label="Back">
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
        <h1 class="auth-title auth-title--sans">Enter the code</h1>
        <p class="auth-subtitle">
          Enter the 6-digit code we sent to your email.
        </p>
      </div>

      <form id="verify-email-form" class="auth-form" autocomplete="off" novalidate>
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
                name="${index === 0 ? 'one-time-code' : `otp-digit-${index}`}"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="${index === 0 ? 6 : 1}"
                autocomplete="${index === 0 ? 'one-time-code' : 'off'}"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                enterkeyhint="done"
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

        <p id="verify-resend-status" class="verify-resend-status" aria-live="polite">
          <span class="verify-resend-countdown">
            Resend code in <span id="verify-resend-timer">${formatResendCountdown(RESEND_OTP_COOLDOWN_SECONDS)}</span>
          </span>
          <span class="verify-resend-ready" hidden>
            Did not get it?
            <button
              type="button"
              id="verify-resend-btn"
              class="auth-legal-link"
              ${state.authLoading ? 'disabled' : ''}
            >
              Resend
            </button>
          </span>
        </p>

        <div class="auth-actions">
          <button
            type="submit"
            id="verify-submit-btn"
            class="auth-cta-primary auth-submit-btn"
            ${state.authLoading ? 'disabled' : ''}
          >
            ${state.authLoading ? 'Verifying…' : 'Verify'}
          </button>
        </div>
      </form>
    </div>
  `;
}
