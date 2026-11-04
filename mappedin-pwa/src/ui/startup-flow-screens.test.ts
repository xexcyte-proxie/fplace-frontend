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
    expect(html).toContain('Sign in');
    expect(html).toContain('id="auth-guest-btn"');
    expect(html).toContain('Continue as guest');
  });

  it('keeps Continue as guest when the fingerprint gate denies access', () => {
    const html = renderOnboardingScreen({
      guestAccessAllowed: false,
      authLoading: false,
    });
    expect(html).toContain('id="auth-guest-btn"');
    expect(html).toContain('Continue as guest');
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
    expect(html).toContain('Allow Location Access');
    expect(html).toContain('id="location-enable-btn"');
    expect(html).toContain('Allow Location');
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
    expect(html).toContain('Location Services');
    expect(html).not.toContain('id="location-try-again-btn"');
    expect(html).toContain('role="dialog"');
  });

  it('shows browser settings help when permanently denied', () => {
    const html = renderLocationPermissionRequiredScreen({
      locationGateLoading: false,
      locationPermanentlyDenied: true,
    });
    expect(html).toContain('Enabling Location Services can enhance your navigation experience. To re-enable this feature, please adjust the relevant settings on your device.');
    expect(html).toContain('>CLOSE</button>');
    expect(html).not.toContain('location-try-again-btn');
    expect(html).not.toContain('Location debug details');
  });

  it('renders Location Error with Retry', () => {
    const html = renderLocationErrorScreen({
      locationGateLoading: false,
      locationGateError: 'Location request timed out. Try again.',
    });
    expect(html).toContain("We Couldn't Find Your Location");
    expect(html).toContain('Try Again');
    expect(html).toContain('id="location-retry-btn"');
    expect(html).toContain('role="dialog"');
  });
});

 it('keeps Not now enabled in every location dialog while waiting', () => {
  for (const html of [
    renderLocationPermissionScreen({ locationGateLoading: true }),
    renderLocationPermissionRequiredScreen({ locationGateLoading: true, locationPermanentlyDenied: true }),
    renderLocationErrorScreen({ locationGateLoading: true, locationGateError: 'Timeout' }),
  ]) {
    expect(html).toContain('id="location-gate-dismiss"');
    expect(html).toMatch(/<button[^>]*id="location-dismiss-btn"[^>]*>(?:Not Now|CLOSE)<\/button>/);
    expect(html.match(/<button[^>]*id="location-dismiss-btn"[^>]*>/)?.[0]).not.toContain('disabled');
  }
 });
