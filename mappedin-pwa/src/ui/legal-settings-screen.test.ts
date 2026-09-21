import { describe, expect, it } from 'vitest';

import { PRIVACY_POLICY } from './settings-data';
import {
  renderAuthPrivacyScreen,
  renderPrivacySettingsScreen,
} from './legal-settings-screen';

describe('renderPrivacySettingsScreen', () => {
  it('keeps the settings privacy back hook used by ui-root-events', () => {
    const html = renderPrivacySettingsScreen();
    expect(html).toContain('id="settings-privacy-back-btn"');
    expect(html).not.toContain('id="auth-legal-back-btn"');
    expect(html).toContain(PRIVACY_POLICY.title);
    expect(html).toContain(`Last updated ${PRIVACY_POLICY.updated}`);
  });

  it('renders each privacy section heading and body', () => {
    const html = renderPrivacySettingsScreen();
    for (const section of PRIVACY_POLICY.sections) {
      expect(html).toContain(section.heading);
      expect(html).toContain(section.body);
    }
  });
});

describe('renderAuthPrivacyScreen', () => {
  it('keeps the auth privacy back hook used by ui-root-events', () => {
    const html = renderAuthPrivacyScreen();
    expect(html).toContain('id="auth-legal-back-btn"');
    expect(html).not.toContain('id="settings-privacy-back-btn"');
    expect(html).toContain(PRIVACY_POLICY.title);
    expect(html).toContain(PRIVACY_POLICY.sections[0]?.heading);
  });
});
