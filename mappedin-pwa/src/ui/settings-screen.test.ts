import { describe, expect, it } from 'vitest';

import { initialAppState } from '../types';
import { renderSettingsScreen } from './settings-screen';

describe('settings screen logout and delete', () => {
  it('renders log out and delete account without a danger zone heading', () => {
    const html = renderSettingsScreen(initialAppState());
    expect(html).toContain('id="settings-logout-btn"');
    expect(html).toContain('id="settings-delete-account-btn"');
    expect(html).not.toContain('Danger zone');
    expect(html).not.toContain('settings-group-label--danger');
  });
});

describe('settings screen app tour toggle', () => {
  it('renders an App tour switch in Preferences', () => {
    const html = renderSettingsScreen(initialAppState());
    expect(html).toContain('App tour');
    expect(html).toContain('Show the highlight walkthrough');
    expect(html).toContain('id="settings-tour-toggle"');
    expect(html).toContain('aria-checked="true"');
    expect(html).not.toContain('settings-replay-tour-btn');
  });

  it('reflects a disabled tour preference', () => {
    const html = renderSettingsScreen({
      ...initialAppState(),
      productTourEnabled: false,
    });
    expect(html).toContain('id="settings-tour-toggle"');
    expect(html).toContain('aria-checked="false"');
  });
});
