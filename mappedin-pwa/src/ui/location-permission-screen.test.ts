import { describe, expect, it } from 'vitest';

import {
  renderLocationErrorScreen,
  renderLocationPermissionRequiredScreen,
  renderLocationPermissionScreen,
} from './location-permission-screen';

describe('renderLocationPermissionScreen', () => {
  it('keeps enable-dialog hooks used by ui-root-events', () => {
    const html = renderLocationPermissionScreen({
      locationGateLoading: false,
    });
    expect(html).toContain('id="location-dialog-title"');
    expect(html).toContain('id="location-dialog-desc"');
    expect(html).toContain('id="location-enable-btn"');
    expect(html).toContain('Used to place you on the map and start indoor routes.');
  });
});

describe('renderLocationPermissionRequiredScreen', () => {
  it('keeps required-dialog hooks and prompt copy', () => {
    const html = renderLocationPermissionRequiredScreen({
      locationGateLoading: false,
      locationPermanentlyDenied: false,
    });
    expect(html).toContain('id="location-required-title"');
    expect(html).toContain('id="location-required-desc"');
    expect(html).toContain('id="location-try-again-btn"');
    expect(html).toContain('Allow location when prompted to continue.');
    expect(html).toContain('Try Again');
  });

  it('shows browser-settings copy when location is permanently denied', () => {
    const html = renderLocationPermissionRequiredScreen({
      locationGateLoading: false,
      locationPermanentlyDenied: true,
    });
    expect(html).toContain(
      'Location is blocked. Allow it in browser settings, then try again.',
    );
  });
});

describe('renderLocationErrorScreen', () => {
  it('keeps error-dialog hooks and fallback copy', () => {
    const html = renderLocationErrorScreen({
      locationGateLoading: false,
      locationGateError: '',
    });
    expect(html).toContain('id="location-error-title"');
    expect(html).toContain('id="location-error-desc"');
    expect(html).toContain('id="location-retry-btn"');
    expect(html).toContain('We could not determine your current location.');
    expect(html).toContain('Retry');
  });

  it('escapes location errors that look like HTML', () => {
    const html = renderLocationErrorScreen({
      locationGateLoading: false,
      locationGateError: '<b>bad</b> <img src=x>',
    });
    expect(html).toContain('&lt;b&gt;bad&lt;/b&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<b>bad</b>');
    expect(html).not.toContain('<img src=x>');
  });
});
