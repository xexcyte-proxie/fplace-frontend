import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderLocationErrorScreen, renderLocationPermissionRequiredScreen, renderLocationPermissionScreen } from './location-permission-screen';
import { locationHelpSteps, locationServicesHelpSteps } from '../location/domain/location-help';
afterEach(() => vi.unstubAllGlobals());
describe('contextual location dialogs', () => {
  it('offers a native permission request before settings instructions', () => {
    const html = renderLocationPermissionScreen({ locationGateLoading: false });
    expect(html).toContain('Allow Location Access');
    expect(html).toContain('fplaces uses your location to show where you are and guide you to your destination.');
    expect(html).toContain('id="location-enable-btn"');
    expect(html).not.toContain('details');
  });
  it('blocked permission offers help without another native prompt', () => {
    const html = renderLocationPermissionRequiredScreen({ locationGateLoading: false, locationPermanentlyDenied: true });
    expect(html).toContain('Enabling Location Services can enhance your navigation experience. To re-enable this feature, please adjust the relevant settings on your device.');
    expect(html).toContain('>CLOSE</button>');
    expect(html).not.toContain('location-try-again-btn');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('<details open');
  });
  it('uncertain restriction is not diagnosed as device location off', () => {
    const html = renderLocationPermissionRequiredScreen({ locationGateLoading: false, locationPermanentlyDenied: false });
    expect(html).toContain('Location Services');
    expect(html).toContain('>CLOSE</button>');
    expect(html).not.toContain('location-try-again-btn');
    expect(html).not.toContain('services are turned off');
  });
  it.each(['Location request timed out.', 'Your device could not provide a location.'])('offers retry for %s without permission denial copy', locationGateError => {
    const html = renderLocationErrorScreen({ locationGateLoading: false, locationGateError });
    expect(html).toContain("We Couldn't Find Your Location");
    expect(html).toContain('id="location-retry-btn"');
    expect(html).not.toContain('access is blocked');
  });
  it('unsupported context explains the limitation instead of retrying forever', () => {
    const html = renderLocationErrorScreen({ locationGateLoading: false, locationGateError: 'Geolocation is not supported.' });
    expect(html).toContain('HTTPS');
    expect(html).not.toContain('id="location-retry-btn"');
  });
  it('never interpolates raw provider errors', () => {
    const html = renderLocationErrorScreen({ locationGateLoading: false, locationGateError: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror=');
  });
  it.each([true, false])('all dialogs have accessible dismissal while loading=%s', loading => {
    for (const html of [renderLocationPermissionScreen({ locationGateLoading: loading }), renderLocationPermissionRequiredScreen({ locationGateLoading: loading, locationPermanentlyDenied: true }), renderLocationErrorScreen({ locationGateLoading: loading, locationGateError: 'timeout' })]) {
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-describedby=');
      expect(html).toContain('id="location-dismiss-btn"');
      expect(html).toMatch(/>(Not Now|CLOSE)<\/button>/);
    }
  });
  it.each(['Safari', 'Chrome', 'Brave', 'Firefox'])('iOS %s guidance never uses Android menus', browser => {
    const steps = locationHelpSteps({ os: 'ios', browser, installed: false }).join(' ');
    expect(steps).toContain('Privacy & Security');
    expect(steps).not.toContain('Site settings → Location');
    if (browser !== 'Safari') expect(steps).not.toContain('Website Settings');
  });
  it.each(['Chrome', 'Brave', 'Firefox'])('Android %s help uses its browser-specific path', browser => {
    const steps = locationHelpSteps({ os: 'android', browser, installed: false }).join(' ');
    expect(steps).toContain(browser);
    expect(steps).not.toContain('Safari');
    expect(steps).toContain('Permissions → Location');
  });
  it('installed help explains separate app permissions', () => {
    expect(locationHelpSteps({ os: 'ios', browser: 'Safari', installed: true }).join(' ')).toContain('Installed app permissions may be separate');
  });
});

describe('device location recovery', () => {
  it.each(['restricted', 'unavailable'] as const)('focuses %s failure with existing access on device settings', locationFailure => {
    const html = renderLocationErrorScreen({ locationGateLoading: false, locationGateError: '', locationPermission: 'granted', locationFailure });
    expect(html).toContain('Location Services');
    expect(html).toContain('Enabling Location Services can enhance your navigation experience. To re-enable this feature, please adjust the relevant settings on your device.');
    expect(html).toContain('>CLOSE</button>');
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).not.toContain('Allow Location Access');
    expect(html).toContain('Browser');
    expect(html).not.toContain('services are turned off');
  });
  it('does not ask for permission again when a granted request reports an access restriction', () => {
    const html = renderLocationPermissionRequiredScreen({ locationGateLoading: false, locationPermanentlyDenied: false, locationPermission: 'granted' });
    expect(html).toContain('Location Services');
    expect(html).toContain('>CLOSE</button>');
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).not.toContain('>Allow Location<');
    expect(html).toContain('Finish');
  });
  it('keeps timeouts separate from a possible device-services problem', () => {
    const html = renderLocationErrorScreen({ locationGateLoading: false, locationGateError: '', locationFailure: 'timeout', locationPermission: 'granted' });
    expect(html).toContain('Finding your position took too long');
    expect(html).not.toContain('Check Location Services</h2>');
  });
});

describe('visible Location Services instructions', () => {
  it('shows exactly three ordered steps below the message and above CLOSE', () => {
    const html = renderLocationPermissionRequiredScreen({ locationGateLoading: false, locationPermanentlyDenied: true });
    expect(html.match(/<li>/g)).toHaveLength(3);
    const message = html.indexOf('Enabling Location Services can enhance your navigation experience. To re-enable this feature, please adjust the relevant settings on your device.');
    const device = html.indexOf('Device:</strong>');
    const browser = html.indexOf('Browser:</strong>');
    const refresh = html.indexOf('Finish:</strong>');
    expect(message).toBeLessThan(device);
    expect(device).toBeLessThan(browser);
    expect(browser).toBeLessThan(refresh);
    expect(refresh).toBeLessThan(html.indexOf('>CLOSE</button>'));
    expect(html).toContain('Return to fplaces and refresh.');
    expect(html).not.toContain('<details');
  });
  it.each([
    ['ios', 'Safari', 'Privacy & Security', 'Website Settings'],
    ['android', 'Chrome', 'Use location', 'Permissions'],
    ['android', 'Firefox', 'Use location', 'Site permissions'],
    ['android', 'Brave', 'Use location', 'All sites'],
    ['other', 'your browser', 'device settings', 'address bar'],
  ])('orders device, browser, refresh guidance for %s %s', (os, browser, deviceText, browserText) => {
    const steps = locationServicesHelpSteps({ os, browser, installed: true });
    expect(steps).toHaveLength(3);
    expect(steps[0]).toContain(deviceText);
    expect(steps[1]).toContain(browserText);
    expect(steps[1]).toContain('browser you used to install it');
    expect(steps[2]).toBe('Return to fplaces and refresh.');
  });
});
