import { describe, expect, it } from 'vitest';

import { initialAppState } from '../types';
import type { AuthUser } from '../auth/domain/entities';
import { renderSettingsScreen } from './settings-screen';
import { APP_VERSION, SETTINGS_SUPPORT } from './settings-data';

function signedInUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    email: 'fan@email.com',
    pseudo_name: 'Fan',
    is_email_verified: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

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

describe('renderSettingsScreen', () => {
  it('keeps settings hooks used by ui-root-events', () => {
    const html = renderSettingsScreen(initialAppState());
    expect(html).toContain('id="settings-back-btn"');
    expect(html).toContain('id="settings-edit-profile-btn"');
    expect(html).toContain('id="settings-interests-btn"');
    expect(html).toContain('id="settings-change-password-btn"');
    expect(html).toContain('id="settings-change-venue-btn"');
    expect(html).toContain('id="settings-notifications-toggle"');
    expect(html).toContain('id="settings-language-btn"');
    expect(html).toContain('id="settings-help-btn"');
    expect(html).toContain(`href="${SETTINGS_SUPPORT.mailto}"`);
    expect(html).toContain('id="settings-privacy-btn"');
    expect(html).toContain('id="settings-terms-btn"');
    expect(html).toContain('id="settings-about-btn"');
    expect(html).toContain(`Version ${APP_VERSION}`);
  });

  it('shows empty copy when interests, venue, and map language are unset', () => {
    const html = renderSettingsScreen(initialAppState());
    expect(html).toContain('None selected');
    expect(html).toContain('Choose a venue');
    expect(html).toContain('Not available');
    expect(html).toContain('settings-row--disabled');
  });

  it('renders log-out confirm hooks and copy', () => {
    const html = renderSettingsScreen({
      ...initialAppState(),
      settingsConfirm: 'logout',
    });
    expect(html).toContain('id="settings-confirm-dismiss"');
    expect(html).toContain('id="settings-confirm-title"');
    expect(html).toContain('id="settings-confirm-cancel-btn"');
    expect(html).toContain('id="settings-confirm-logout-btn"');
    expect(html).toContain('Log out?');
    expect(html).toContain('You will need to sign in again to use fplaces.');
    expect(html).not.toContain('id="settings-confirm-delete-btn"');
  });

  it('renders delete-account confirm hooks and copy', () => {
    const html = renderSettingsScreen({
      ...initialAppState(),
      settingsConfirm: 'delete-account',
    });
    expect(html).toContain('id="settings-confirm-delete-btn"');
    expect(html).toContain('Delete account?');
    expect(html).toContain(
      'This permanently removes your account and cannot be undone.',
    );
    expect(html).not.toContain('id="settings-confirm-logout-btn"');
  });

  it('escapes pseudo-name, venue, and map language that look like HTML', () => {
    const html = renderSettingsScreen({
      ...initialAppState(),
      authUser: signedInUser({
        pseudo_name: '<b>Fan</b>',
        interests: ['Live music'],
      }),
      selectedVenueId: '1',
      forumVenues: [{ id: 1, name: '<i>Riverside</i>', location: 'Lagos' }],
      mapLanguageName: '<em>English</em>',
      mapLanguages: [{ code: 'en', name: 'English' }],
    });
    expect(html).toContain('&lt;b&gt;Fan&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;Riverside&lt;/i&gt;');
    expect(html).toContain('&lt;em&gt;English&lt;/em&gt;');
    expect(html).toContain('1 selected');
    expect(html).not.toContain('<b>Fan</b>');
    expect(html).not.toContain('<i>Riverside</i>');
    expect(html).not.toContain('<em>English</em>');
  });
});
