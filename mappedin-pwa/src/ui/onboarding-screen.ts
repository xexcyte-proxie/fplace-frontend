import type { AppState } from '../types';
import { renderBusyLabel } from './content-loading-overlay';

export function renderOnboardingScreen(
  state: Pick<AppState, 'guestAccessAllowed' | 'authLoading'>,
): string {
  const disabled = state.authLoading ? 'disabled' : '';

  return `
    <div class="onboarding-screen">
      <div class="onboarding-copy">
        <h1 class="onboarding-title">
          Find places.<br />
          Find people.<br />
          Find your way.
        </h1>
      </div>

      <div class="onboarding-actions">
        <button type="button" id="onboarding-create-account" class="onboarding-cta-primary" ${disabled}>
          Create account
        </button>
        <button type="button" id="onboarding-login" class="onboarding-cta-secondary" ${disabled}>
          Sign in
        </button>
        <button
          type="button"
          id="auth-guest-btn"
          class="auth-guest-btn${state.authLoading ? ' is-loading' : ''}"
          ${disabled}
          aria-busy="${state.authLoading ? 'true' : 'false'}"
        >
          ${state.authLoading ? renderBusyLabel('Continuing…') : 'Continue as guest'}
        </button>
      </div>
    </div>
  `;
}
