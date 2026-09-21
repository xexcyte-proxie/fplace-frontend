import { describe, expect, it } from 'vitest';

import { initialAppState } from '../types';
import { renderLanguageSettingsScreen } from './language-settings-screen';

describe('renderLanguageSettingsScreen', () => {
  it('keeps language-settings hooks used by ui-root-events', () => {
    const html = renderLanguageSettingsScreen({
      ...initialAppState(),
      mapLanguages: [
        { code: 'en', name: 'English' },
        { code: 'fr', name: 'Français' },
      ],
      mapLanguageCode: 'en',
      mapStatus: 'ready',
    });
    expect(html).toContain('id="settings-language-back-btn"');
    expect(html).toContain('data-map-language="en"');
    expect(html).toContain('data-map-language="fr"');
    expect(html).toContain('Map language');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('settings-row--selected');
  });

  it('shows empty copy when the map is ready with no languages', () => {
    const html = renderLanguageSettingsScreen({
      ...initialAppState(),
      mapLanguages: [],
      mapStatus: 'ready',
    });
    expect(html).toContain(
      'This map has no additional languages configured in Mappedin CMS.',
    );
    expect(html).not.toContain('data-map-language=');
    expect(html).not.toContain('Loading languages');
  });

  it('shows a loading overlay while the language catalog is arriving', () => {
    const html = renderLanguageSettingsScreen({
      ...initialAppState(),
      mapLanguages: [],
      mapStatus: 'loading',
    });
    expect(html).toContain('Loading languages');
    expect(html).not.toContain(
      'This map has no additional languages configured in Mappedin CMS.',
    );
  });

  it('escapes language names and codes that look like HTML', () => {
    const html = renderLanguageSettingsScreen({
      ...initialAppState(),
      mapLanguages: [{ code: '<en>', name: '<b>English</b>' }],
      mapLanguageCode: '<en>',
      mapStatus: 'ready',
    });
    expect(html).toContain('data-map-language="&lt;en&gt;"');
    expect(html).toContain('&lt;b&gt;English&lt;/b&gt;');
    expect(html).toContain('&lt;EN&gt;');
    expect(html).not.toContain('<b>English</b>');
    expect(html).not.toContain('data-map-language="<en>"');
  });
});
