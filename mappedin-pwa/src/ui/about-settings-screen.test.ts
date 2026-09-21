import { describe, expect, it } from 'vitest';

import { APP_VERSION } from './settings-data';
import { renderAboutSettingsScreen } from './about-settings-screen';

describe('renderAboutSettingsScreen', () => {
  it('keeps about-settings hooks used by ui-root-events', () => {
    const html = renderAboutSettingsScreen();
    expect(html).toContain('id="settings-about-back-btn"');
    expect(html).toContain('About');
    expect(html).toContain('fPlaces');
    expect(html).toContain('Anonymous venue navigation and social maps.');
  });

  it('shows version and credits copy', () => {
    const html = renderAboutSettingsScreen();
    expect(html).toContain('Version');
    expect(html).toContain(APP_VERSION);
    expect(html).toContain(
      'Indoor maps powered by Mappedin. Built for fans who want to find their people without giving up anonymity.',
    );
  });
});
