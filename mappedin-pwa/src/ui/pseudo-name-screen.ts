import type { AppState } from '../types';
import {
  PROFILE_INTEREST_OPTIONS,
  PSEUDO_NAME_PLACEHOLDER,
} from './pseudo-name-data';

const AUTH_ASSETS = {
  back: '/auth/back-chevron.svg',
  shuffle: '/auth/shuffle.svg',
} as const;

export function renderPseudoNameScreen(
  state: Pick<
    AppState,
    | 'pseudoNameDraft'
    | 'pseudoNameHint'
    | 'selectedInterests'
    | 'authLoading'
    | 'authFieldErrors'
  > & {
    allowBack?: boolean;
  },
): string {
  const nameError = state.authFieldErrors.pseudo_name ?? '';
  const generalError = state.authFieldErrors._form ?? '';
  const selected = new Set(state.selectedInterests);
  const allowBack = state.allowBack !== false;
  const nameHint = state.pseudoNameHint || PSEUDO_NAME_PLACEHOLDER;

  const interestChips = PROFILE_INTEREST_OPTIONS.map((interest) => {
    const isSelected = selected.has(interest);
    return `
      <button
        type="button"
        class="interest-chip${isSelected ? ' interest-chip--selected' : ''}"
        data-interest="${escapeHtml(interest)}"
        aria-pressed="${isSelected ? 'true' : 'false'}"
        ${state.authLoading ? 'disabled' : ''}
      >
        ${escapeHtml(interest)}
      </button>
    `;
  }).join('');

  return `
    <div class="auth-screen pseudo-name-screen">
      ${
        allowBack
          ? `<button type="button" id="pseudo-name-back-btn" class="auth-back-btn" aria-label="Back">
        <img
          class="auth-back-icon"
          src="${AUTH_ASSETS.back}"
          alt=""
          width="22"
          height="22"
          decoding="async"
        />
      </button>`
          : ''
      }

      <div class="auth-header">
        <h1 class="auth-title auth-title--sans">Pick a pseudo-name</h1>
        <p class="auth-subtitle">
          No real names here. Stay anonymous in the crowd.
        </p>
      </div>

      <form id="pseudo-name-form" class="auth-form pseudo-name-form" novalidate>
        ${
          generalError
            ? `<p class="auth-form-error" role="alert">${escapeHtml(generalError)}</p>`
            : ''
        }

        <div class="auth-field">
          <div class="pseudo-name-input-wrap">
            <input
              id="pseudo-name-input"
              name="pseudo_name"
              type="text"
              class="auth-input pseudo-name-input${nameError ? ' auth-input--error' : ''}"
              maxlength="50"
              autocomplete="username"
              placeholder="${escapeHtml(nameHint)}"
              value="${escapeHtml(state.pseudoNameDraft)}"
              ${state.authLoading ? 'disabled' : ''}
              required
            />
            <button
              type="button"
              id="pseudo-name-shuffle-btn"
              class="pseudo-name-shuffle-btn"
              aria-label="Generate a new pseudo-name"
              ${state.authLoading ? 'disabled' : ''}
            >
              <img
                class="pseudo-name-shuffle-icon"
                src="${AUTH_ASSETS.shuffle}"
                alt=""
                width="20"
                height="20"
                decoding="async"
              />
            </button>
          </div>
          ${nameError ? `<span class="auth-field-error" role="alert">${escapeHtml(nameError)}</span>` : ''}
        </div>

        <section class="pseudo-name-interests" aria-labelledby="interests-heading">
          <h2 id="interests-heading" class="pseudo-name-section-title">Your interests</h2>
          <p class="pseudo-name-section-subtitle">Pick a few to personalize your feed.</p>
          <div class="interest-chip-grid" role="group" aria-label="Interests">
            ${interestChips}
          </div>
        </section>

        <div class="auth-actions">
          <button
            type="submit"
            id="pseudo-name-continue-btn"
            class="auth-cta-primary auth-submit-btn"
            ${state.authLoading ? 'disabled' : ''}
          >
            ${state.authLoading ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
