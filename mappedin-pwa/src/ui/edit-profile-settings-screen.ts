import type { AppState } from '../types';
import { interestOptionsForPicker } from '../auth/domain/interest-options';
import { PSEUDO_NAME_PLACEHOLDER } from './pseudo-name-data';
import { AUTH_AUTOCOMPLETE } from './auth-autofill';
import { authFieldError } from './auth-field-error';
import { renderBusyLabel } from './content-loading-overlay';
import { escapeHtml } from './escape-html';

export function renderEditProfileSettingsScreen(
  state: Pick<
    AppState,
    | 'pseudoNameDraft'
    | 'pseudoNameHint'
    | 'selectedInterests'
    | 'interestOptions'
    | 'profileEditSaving'
    | 'authFieldErrors'
  >,
): string {
  const saving = state.profileEditSaving;
  const nameError = authFieldError(state.authFieldErrors, 'pseudo_name');
  const generalError = authFieldError(state.authFieldErrors, '_form');
  const selected = new Set(state.selectedInterests);
  const nameHint = state.pseudoNameHint || PSEUDO_NAME_PLACEHOLDER;

  const interestChips = interestOptionsForPicker(
    state.interestOptions,
    state.selectedInterests,
  ).map((interest) => {
    const isSelected = selected.has(interest);
    return `
      <button
        type="button"
        class="interest-chip${isSelected ? ' interest-chip--selected' : ''}"
        data-interest="${escapeHtml(interest)}"
        aria-pressed="${isSelected ? 'true' : 'false'}"
        ${saving ? 'disabled' : ''}
      >
        ${escapeHtml(interest)}
      </button>
    `;
  }).join('');

  return `
    <div class="settings-screen">
      <header class="settings-header">
        <button type="button" id="edit-profile-back-btn" class="settings-back-btn" aria-label="Back" ${saving ? 'disabled' : ''}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
        <h1 class="settings-title">Edit profile</h1>
      </header>

      <div class="settings-content">
        <form id="edit-profile-form" class="settings-edit-form" novalidate>
          ${
            generalError
              ? `<p class="settings-form-error" role="alert">${escapeHtml(generalError)}</p>`
              : ''
          }

          <section class="settings-group">
            <h2 class="settings-group-label">Pseudo-name</h2>
            <div class="settings-card settings-card--padded">
              <div class="pseudo-name-input-wrap">
                <input
                  id="pseudo-name-input"
                  name="pseudo_name"
                  type="text"
                  class="auth-input pseudo-name-input${nameError ? ' auth-input--error' : ''}"
                  maxlength="50"
                  autocomplete="${AUTH_AUTOCOMPLETE.displayName}"
                  placeholder="${escapeHtml(nameHint)}"
                  value="${escapeHtml(state.pseudoNameDraft)}"
                  ${saving ? 'disabled' : ''}
                  required
                />
                <button
                  type="button"
                  id="pseudo-name-shuffle-btn"
                  class="pseudo-name-shuffle-btn"
                  aria-label="Generate a new pseudo-name"
                  ${saving ? 'disabled' : ''}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M21 4v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
              ${
                nameError
                  ? `<span class="auth-field-error" role="alert">${escapeHtml(nameError)}</span>`
                  : `<p class="settings-field-hint">Shown on your profile and in the venue feed.</p>`
              }
            </div>
          </section>

          <section class="settings-group">
            <h2 class="settings-group-label">Interests</h2>
            <div class="settings-card settings-card--padded">
              <p class="settings-field-hint settings-field-hint--tight">Pick a few to personalize your feed.</p>
              <div class="interest-chip-grid" role="group" aria-label="Interests">
                ${interestChips}
              </div>
            </div>
          </section>

          <div class="settings-edit-actions">
            <button
              type="submit"
              id="edit-profile-save-btn"
              class="onboarding-primary-btn auth-submit-btn${saving ? ' is-loading' : ''}"
              ${saving ? 'disabled' : ''}
              aria-busy="${saving ? 'true' : 'false'}"
            >
              ${saving ? renderBusyLabel('Saving…') : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}
