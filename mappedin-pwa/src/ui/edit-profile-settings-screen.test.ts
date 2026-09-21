import { describe, expect, it } from 'vitest';

import { DEFAULT_INTEREST_OPTIONS } from '../auth/domain/interest-options';
import { renderEditProfileSettingsScreen } from './edit-profile-settings-screen';

const idleState = {
  pseudoNameDraft: 'Olasax',
  pseudoNameHint: 'RowdyGull_47',
  selectedInterests: ['Photography'],
  interestOptions: [...DEFAULT_INTEREST_OPTIONS],
  profileEditSaving: false,
  authFieldErrors: {},
};

describe('renderEditProfileSettingsScreen', () => {
  it('shows Save changes on first open even if global auth is loading', () => {
    const html = renderEditProfileSettingsScreen(idleState);
    expect(html).toContain('Save changes');
    expect(html).not.toContain('Saving…');
    expect(html).not.toContain('busy-indicator');
  });

  it('shows Saving only while the profile edit request is in flight', () => {
    const html = renderEditProfileSettingsScreen({
      ...idleState,
      profileEditSaving: true,
    });
    expect(html).toContain('Saving…');
    expect(html).toContain('busy-indicator');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('Save changes');
  });

  it('keeps edit-profile hooks used by ui-root-events', () => {
    const html = renderEditProfileSettingsScreen(idleState);
    expect(html).toContain('id="edit-profile-back-btn"');
    expect(html).toContain('id="edit-profile-form"');
    expect(html).toContain('id="pseudo-name-input"');
    expect(html).toContain('id="pseudo-name-shuffle-btn"');
    expect(html).toContain('id="edit-profile-save-btn"');
    expect(html).toContain('data-interest="Photography"');
    expect(html).toContain('Edit profile');
    expect(html).toContain('Shown on your profile and in the venue feed.');
  });

  it('shows an empty interest grid when the catalog has no chips', () => {
    const html = renderEditProfileSettingsScreen({
      ...idleState,
      selectedInterests: [],
      interestOptions: [],
    });
    expect(html).toContain('role="group" aria-label="Interests"');
    expect(html).not.toContain('data-interest=');
  });

  it('escapes name, hint, interests, and errors that look like HTML', () => {
    const html = renderEditProfileSettingsScreen({
      ...idleState,
      pseudoNameDraft: '"quoted"',
      pseudoNameHint: '<i>hint</i>',
      selectedInterests: ['<em>Live</em>'],
      interestOptions: ['<b>Merch</b>'],
      authFieldErrors: {
        pseudo_name: '<b>bad</b>',
        _form: '<img src=x>',
      },
    });
    expect(html).toContain('value="&quot;quoted&quot;"');
    expect(html).toContain('placeholder="&lt;i&gt;hint&lt;/i&gt;"');
    expect(html).toContain('data-interest="&lt;b&gt;Merch&lt;/b&gt;"');
    expect(html).toContain('data-interest="&lt;em&gt;Live&lt;/em&gt;"');
    expect(html).toContain('&lt;b&gt;bad&lt;/b&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('Shown on your profile and in the venue feed.');
    expect(html).not.toContain('<b>Merch</b>');
    expect(html).not.toContain('<em>Live</em>');
    expect(html).not.toContain('<b>bad</b>');
    expect(html).not.toContain('<img src=x>');
  });
});
