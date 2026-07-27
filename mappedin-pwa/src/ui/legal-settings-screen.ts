import { PRIVACY_POLICY, type LegalDocument } from './settings-data';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderLegalDocument(
  document: LegalDocument,
  backButtonId: string,
): string {
  const sections = document.sections
    .map(
      (section) => `
        <section class="settings-group">
          <h2 class="settings-group-label">${escapeHtml(section.heading)}</h2>
          <div class="settings-card settings-card--padded">
            <p class="settings-legal-body">${escapeHtml(section.body)}</p>
          </div>
        </section>
      `,
    )
    .join('');

  return `
    <div class="settings-screen">
      <header class="settings-header">
        <button type="button" id="${escapeHtml(backButtonId)}" class="settings-back-btn" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
        <h1 class="settings-title">${escapeHtml(document.title)}</h1>
      </header>

      <div class="settings-content">
        <p class="settings-legal-updated">Last updated ${escapeHtml(document.updated)}</p>
        ${sections}
      </div>
    </div>
  `;
}

export function renderPrivacySettingsScreen(): string {
  return renderLegalDocument(PRIVACY_POLICY, 'settings-privacy-back-btn');
}

export function renderAuthPrivacyScreen(): string {
  return renderLegalDocument(PRIVACY_POLICY, 'auth-legal-back-btn');
}
