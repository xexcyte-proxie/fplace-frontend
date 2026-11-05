import { renderDesktopBrand } from './desktop-brand';
import type { AppState } from '../types';
import { renderBusyLabel } from './content-loading-overlay';

export function renderOnboardingScreen(
  state: Pick<AppState, 'guestAccessAllowed' | 'authLoading'>,
): string {
  const disabled = state.authLoading ? 'disabled' : '';

  return `
    <div class="onboarding-screen">
      <div class="desktop-welcome-wordmark">fplaces<span>Find your people. Find your place.</span></div>
      <div class="onboarding-copy">
        <h1 class="onboarding-title">
          Find places.<br />
          Find people.<br />
          Find your way.
        </h1>
        <p class="desktop-welcome-description">From your first step to your next connection.<br>Explore venues, navigate indoors, and see what the crowd is saying.</p>
      </div>

      <div class="onboarding-actions">
        <p class="desktop-welcome-action-label">Make yourself at home.</p>
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
      ${renderDesktopBrand()}
    </div>
  `;
}
