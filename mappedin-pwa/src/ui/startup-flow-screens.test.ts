import { describe, expect, it } from 'vitest';

import { renderArTeaserScreen } from './ar-teaser-screen';
import { renderFeaturesScreen } from './features-screen';
import { renderIntroductionScreen } from './introduction-screen';
import {
  renderLocationErrorScreen,
  renderLocationPermissionRequiredScreen,
  renderLocationPermissionScreen,
} from './location-permission-screen';
import { renderOnboardingScreen } from './onboarding-screen';

/**
 * Widget-style tests: assert screen markup contracts (titles + action hooks)
 * without mounting a browser DOM framework.
 */
describe('startup flow screens (widget)', () => {
  it('renders Welcome create-account, login, and guest CTAs', () => {
    const html = renderOnboardingScreen({
      guestAccessAllowed: true,
      authLoading: false,
    });
    expect(html).toContain('Find places.');
    expect(html).toContain('Find people.');
    expect(html).toContain('Find your way.');
    expect(html).toContain('id="onboarding-create-account"');
    expect(html).toContain('Create account');
    expect(html).toContain('id="onboarding-login"');
    expect(html).toContain('I already have an account');
    expect(html).toContain('id="auth-guest-btn"');
    expect(html).toContain('Continue as guest');
  });

  it('hides Continue as guest when the fingerprint gate denies access', () => {
    const html = renderOnboardingScreen({
      guestAccessAllowed: false,
      authLoading: false,
    });
    expect(html).not.toContain('id="auth-guest-btn"');
    expect(html).not.toContain('Continue as guest');
  });

  it('disables Continue as guest while auth is in progress', () => {
    const html = renderOnboardingScreen({
      guestAccessAllowed: true,
      authLoading: true,
    });
    expect(html).toContain('id="auth-guest-btn"');
    expect(html).toContain('Continuing…');
    expect(html).toContain('busy-indicator');
    expect(html).toContain('disabled');
  });

  it('renders AR teaser placeholder with skip', () => {
    const html = renderArTeaserScreen();
    expect(html).toContain('AR teaser');
    expect(html).toContain('id="ar-teaser-skip-btn"');
    expect(html).toContain('Skip');
    expect(html).toContain('id="ar-teaser-continue"');
    expect(html).toContain('Continue');
  });

  it('renders Introduction placeholder with continue', () => {
    const html = renderIntroductionScreen();
    expect(html).toContain('Introduction');
    expect(html).toContain('id="introduction-continue"');
  });

  it('renders Features placeholder with continue', () => {
    const html = renderFeaturesScreen();
    expect(html).toContain('Features');
    expect(html).toContain('id="features-continue"');
  });

  it('renders Location Permission enable button', () => {
    const html = renderLocationPermissionScreen({
      locationGateLoading: false,
    });
    expect(html).toContain('Enable location');
    expect(html).toContain('id="location-enable-btn"');
    expect(html).toContain('Enable Location');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('location-dialog-backdrop');
  });

  it('shows loading label while requesting location', () => {
    const html = renderLocationPermissionScreen({
      locationGateLoading: true,
    });
    expect(html).toContain('Getting location…');
    expect(html).toContain('disabled');
    expect(html).toContain('busy-indicator');
    expect(html).toContain('aria-busy="true"');
  });

  it('renders Location Permission Required with Try Again', () => {
    const html = renderLocationPermissionRequiredScreen({
      locationGateLoading: false,
      locationPermanentlyDenied: false,
    });
    expect(html).toContain('Location Permission Required');
    expect(html).toContain('id="location-try-again-btn"');
    expect(html).toContain('role="dialog"');
  });

  it('shows browser settings help when permanently denied', () => {
    const html = renderLocationPermissionRequiredScreen({
      locationGateLoading: false,
      locationPermanentlyDenied: true,
    });
    expect(html).toMatch(/browser settings/i);
  });

  it('renders Location Error with Retry', () => {
    const html = renderLocationErrorScreen({
      locationGateLoading: false,
      locationGateError: 'Location request timed out. Try again.',
    });
    expect(html).toContain('Location Error');
    expect(html).toContain('Location request timed out. Try again.');
    expect(html).toContain('id="location-retry-btn"');
    expect(html).toContain('role="dialog"');
  });
});
