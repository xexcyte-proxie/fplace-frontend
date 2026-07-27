import type { AppState } from '../types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderLanguageSettingsScreen(state: AppState): string {
  const languages = state.mapLanguages;
  const selectedCode = state.mapLanguageCode;
  const changing = state.mapLanguageChanging;

  const languageRows = languages.length
    ? languages
        .map((language) => {
          const selected = language.code === selectedCode;
          return `
            <button
              type="button"
              class="settings-row${selected ? ' settings-row--selected' : ''}"
              data-map-language="${escapeHtml(language.code)}"
              aria-pressed="${selected ? 'true' : 'false'}"
              ${changing ? 'disabled' : ''}
            >
              <span class="settings-row-icon settings-row-icon--indigo" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"></circle>
                  <path d="M3 12h18M12 3c2.8 2.6 4.2 5.8 4.2 9s-1.4 6.4-4.2 9c-2.8-2.6-4.2-5.8-4.2-9S9.2 5.6 12 3z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>
                </svg>
              </span>
              <span class="settings-row-copy">
                <span class="settings-row-title">${escapeHtml(language.name)}</span>
                <span class="settings-row-subtitle">${escapeHtml(language.code.toUpperCase())}</span>
              </span>
              ${
                selected
                  ? `<span class="settings-language-check" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
                      </svg>
                    </span>`
                  : ''
              }
            </button>
          `;
        })
        .join('<div class="settings-divider"></div>')
    : `<p class="settings-language-empty">This map has no additional languages configured in Mappedin CMS.</p>`;

  return `
    <div class="settings-screen">
      <header class="settings-header">
        <button type="button" id="settings-language-back-btn" class="settings-back-btn" aria-label="Back" ${changing ? 'disabled' : ''}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
        <h1 class="settings-title">Map language</h1>
      </header>

      <div class="settings-content">
        <section class="settings-group">
          <h2 class="settings-group-label">Available languages</h2>
          <div class="settings-card">
            ${languageRows}
          </div>
          ${
            changing
              ? `<p class="settings-language-status" role="status">Updating map language…</p>`
              : ''
          }
        </section>
      </div>
    </div>
  `;
}
