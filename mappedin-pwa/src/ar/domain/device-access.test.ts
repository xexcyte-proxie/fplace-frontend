import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { AR_MOBILE_MESSAGE, isDesktopArDevice, isMobileArDevice } from './device-access';
import { MapApp } from '../../services/map-app';

const cases = [
  ['Windows desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0, false],
  ['touchscreen Windows laptop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 10, false],
  ['Mac desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0, false],
  ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 5, true],
  ['Android phone', 'Mozilla/5.0 (Linux; Android 15)', 5, true],
  ['iPad desktop browsing', 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5, true],
] as const;

afterEach(() => vi.unstubAllGlobals());

describe('AR device access', () => {
  for (const [label, userAgent, maxTouchPoints, expected] of cases) {
    it(`classifies ${label} consistently in the PWA and direct AR page`, () => {
      expect(isMobileArDevice({ userAgent, maxTouchPoints })).toBe(expected);
      const window = { navigator: { userAgent, maxTouchPoints } };
      vm.runInNewContext(readFileSync(new URL('../../../../ar-nav/js/mobile-device.js', import.meta.url), 'utf8'), {
        window, document: { addEventListener: vi.fn() },
      });
      expect((window as typeof window & { __fplacesArDesktopBlocked: boolean }).__fplacesArDesktopBlocked).toBe(!expected);
    });
  }

  it('does not allow a desktop by resizing its window', () => {
    vi.stubGlobal('window', { innerWidth: 390 });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 });
    expect(isDesktopArDevice()).toBe(true);
  });

  for (const method of ['openNavigateArVenuePicker', 'openArForNavigateVenue', 'openVenueArFromHome', 'openAr', 'confirmGuestArOneTimeTrial', 'enterArFullscreen', 'maximizeAr']) {
    it(`blocks ${method} before location, camera or guest-trial work`, async () => {
      vi.stubGlobal('window', {});
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 0 });
      const app = { showToast: vi.fn() };
      await (MapApp.prototype as unknown as Record<string, (this: typeof app) => unknown>)[method].call(app);
      expect(app.showToast).toHaveBeenCalledWith(AR_MOBILE_MESSAGE);
    });
  }
});
