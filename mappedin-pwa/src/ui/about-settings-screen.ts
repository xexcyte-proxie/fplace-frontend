import { APP_VERSION } from './settings-data';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderAboutSettingsScreen(): string {
  return `
    <div class="settings-screen">
      <header class="settings-header">
        <button type="button" id="settings-about-back-btn" class="settings-back-btn" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
        <h1 class="settings-title">About</h1>
      </header>

      <div class="settings-content">
        <section class="settings-group">
          <div class="settings-about-hero">
            <span class="settings-about-mark" aria-hidden="true">fP</span>
            <h2 class="settings-about-name">fPlaces</h2>
            <p class="settings-about-tagline">Anonymous venue navigation and social maps.</p>
          </div>
        </section>

        <section class="settings-group">
          <h2 class="settings-group-label">App info</h2>
          <div class="settings-card">
            <div class="settings-row settings-row--static">
              <span class="settings-row-icon settings-row-icon--indigo" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"></circle>
                  <path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
                </svg>
              </span>
              <span class="settings-row-copy">
                <span class="settings-row-title">Version</span>
                <span class="settings-row-subtitle">${escapeHtml(APP_VERSION)}</span>
              </span>
            </div>
          </div>
        </section>

        <section class="settings-group">
          <h2 class="settings-group-label">Credits</h2>
          <div class="settings-card settings-card--padded">
            <p class="settings-legal-body">
              Indoor maps powered by Mappedin. Built for fans who want to find their people without giving up anonymity.
            </p>
          </div>
        </section>
      </div>
    </div>
  `;
}
